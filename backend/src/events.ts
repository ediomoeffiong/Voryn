import type { Event as DbEvent, Prisma, TicketType, User } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

type JsonRecord = Record<string, unknown>;

const cleanOptions: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote", "img", "div", "span"],
  allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt", "width", "height", "loading"], "*": ["style"] },
  allowedStyles: { "*": { "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/] } },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }), img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }) }
};

export function sanitizeDescription(value: string | undefined) {
  return value === undefined ? undefined : sanitizeHtml(value, cleanOptions);
}

function json<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return (value ?? fallback) as T;
}

export function publicEvent(event: DbEvent, tickets: TicketType[] = [], includePrivate = false) {
  const location = json<JsonRecord>(event.location, {});
  if (!includePrivate && location.revealAfterRegistration !== false) {
    delete location.meetingUrl;
    delete location.joiningInstructions;
    delete location.accessRestriction;
  }
  return {
    id: event.id, title: event.title, slug: event.slug, summary: event.summary, shortSummary: event.shortSummary ?? event.summary,
    descriptionHtml: event.descriptionHtml ?? "", category: event.category, type: event.type, mode: event.mode,
    status: event.status, visibility: event.visibility, attendanceFormat: event.attendanceFormat ?? (event.mode === "online" ? "online" : "physical"),
    startsAt: event.startsAt, endsAt: event.endsAt?.toISOString() ?? null, timezone: event.timezone ?? "UTC", venue: event.venue,
    citySlug: event.citySlug, country: event.country, organizerSlug: event.organizerSlug, media: event.media,
    tags: event.tags, targetAudience: event.targetAudience ?? "", language: event.language ?? "en", schedule: json(event.schedule, []), recurrence: event.recurrence,
    location, registration: json(event.registration, { mode: "free", accountRequired: true, questions: [] }), faqs: json(event.faqs, []), speakers: json(event.speakers, []),
    advancedSettings: json(event.advancedSettings, {}), tickets: tickets.map(({ eventId: _eventId, ...ticket }) => ({ ...ticket, salesOpenAt: ticket.salesOpenAt?.toISOString() ?? null, salesCloseAt: ticket.salesCloseAt?.toISOString() ?? null })),
    attendeeCount: event.attendeeCount, rsvpCount: event.rsvpCount, ticketSalesCount: event.ticketSalesCount, badges: event.badges,
    priceLabel: event.priceLabel, capacity: event.capacity, reservedCount: event.reservedCount, publishAt: event.publishAt?.toISOString() ?? null,
    publishedAt: event.publishedAt?.toISOString() ?? null, cancelledAt: event.cancelledAt?.toISOString() ?? null, cancellationReason: event.cancellationReason,
    archivedAt: event.archivedAt?.toISOString() ?? null, trashedAt: event.trashedAt?.toISOString() ?? null, version: event.version,
    createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString()
  };
}

export function publicationErrors(event: DbEvent, tickets: TicketType[]) {
  const errors: Array<{ field: string; message: string }> = [];
  const location = json<JsonRecord>(event.location, {});
  const registration = json<JsonRecord>(event.registration, { mode: "free" });
  if (event.title.trim().length < 3) errors.push({ field: "title", message: "Add an event title with at least 3 characters." });
  if (!event.category.trim()) errors.push({ field: "category", message: "Choose an event category." });
  if ((event.shortSummary ?? event.summary).trim().length < 10) errors.push({ field: "shortSummary", message: "Add a short summary with at least 10 characters." });
  if (!event.descriptionHtml?.trim() && event.summary.trim().length < 20) errors.push({ field: "descriptionHtml", message: "Add a complete event description." });
  const starts = new Date(event.startsAt);
  if (Number.isNaN(starts.getTime())) errors.push({ field: "startsAt", message: "Choose a valid start date and time." });
  if (!event.endsAt || event.endsAt <= starts) errors.push({ field: "endsAt", message: "End time must be after the start time." });
  if (!event.timezone) errors.push({ field: "timezone", message: "Choose an event time zone." });
  if (["physical", "hybrid"].includes(String(event.attendanceFormat)) && (!String(location.venueName ?? event.venue).trim() || !String(location.city ?? "").trim() || !String(location.country ?? event.country).trim())) errors.push({ field: "location", message: "Physical and hybrid events require a venue, city, and country." });
  if (["online", "hybrid"].includes(String(event.attendanceFormat)) && !String(location.meetingUrl ?? "").trim()) errors.push({ field: "location.meetingUrl", message: "Online and hybrid events require a valid meeting URL." });
  if (registration.mode !== "disabled" && tickets.length === 0) errors.push({ field: "tickets", message: "Add at least one ticket type or disable registration." });
  if (registration.mode === "paid" && !tickets.some((ticket) => ticket.priceMinor > 0)) errors.push({ field: "tickets", message: "Paid registration requires a priced ticket." });
  for (const ticket of tickets) {
    if (ticket.capacity !== null && ticket.capacity < ticket.reservedCount) errors.push({ field: `tickets.${ticket.id}.capacity`, message: `${ticket.name} capacity is below confirmed reservations.` });
    if (ticket.salesOpenAt && ticket.salesCloseAt && ticket.salesCloseAt <= ticket.salesOpenAt) errors.push({ field: `tickets.${ticket.id}.salesCloseAt`, message: `${ticket.name} sales window is invalid.` });
  }
  const sessions = json<Array<{ title?: string; startsAt?: string; endsAt?: string; track?: string }>>(event.schedule, []);
  const ordered = [...sessions].sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime());
  for (const [index, session] of ordered.entries()) {
    const sessionStart = new Date(session.startsAt ?? ""); const sessionEnd = new Date(session.endsAt ?? "");
    if (sessionStart < starts || (event.endsAt && sessionEnd > event.endsAt)) errors.push({ field: "schedule", message: `${session.title ?? "A session"} falls outside the event schedule.` });
    const previous = ordered[index - 1];
    if (previous && (previous.track ?? "main") === (session.track ?? "main") && new Date(previous.endsAt ?? "") > sessionStart) errors.push({ field: "schedule", message: `${session.title ?? "A session"} overlaps another session in the same track.` });
  }
  return errors;
}

export async function writeLifecycle(event: DbEvent, actor: User, action: string, before?: unknown, after?: unknown) {
  await prisma.eventLifecycleLog.create({ data: { eventId: event.id, actorId: actor.id, action, before: before as Prisma.InputJsonValue | undefined, after: after as Prisma.InputJsonValue | undefined } });
}

export async function ticketsFor(eventId: string) {
  return prisma.ticketType.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
}

export function requireVersion(current: number, supplied: number | undefined) {
  if (supplied === undefined) throw new HttpError(428, "This change requires the latest event version");
  if (supplied !== current) throw new HttpError(409, "This event changed in another session. Reload before saving again.");
}

