import type { Express, Request } from "express";
import { Prisma, type Event as DbEvent, type Organizer, type Registration, type TicketType, type User } from "@prisma/client";
import { addEventToStore, cities, events as cachedEvents, organizers as cachedOrganizers, publicEvents, removeEventFromStore, updateEventVisibility } from "./data.js";
import type { Event, EventStatus } from "./domain.js";
import { prisma } from "./db.js";
import { asyncHandler, HttpError } from "./http.js";
import { createOpaqueToken, createTicketCode, hashPassword, hashToken, isPasswordHash, normalizeEmail, validatePassword, verifyLegacyPassword, verifyPassword } from "./security.js";
import { slugify, uniqueSlug } from "./slug.js";
import { announcementSchema, changePasswordSchema, dashboardSchema, eventCreateSchema, eventUpdateSchema, lifecycleSchema, loginSchema, organizerProfileSchema, profileSchema, resetConfirmSchema, resetRequestSchema, reviewSchema, signupSchema } from "./validation.js";
import { createSession, currentUser, requireAdmin, requireAuth, requireEventOwnership, requireOrganizationPermission, requireOrganizer, requireParticipantAccess, revokeSession, safeUser } from "./auth.js";
import { publicationErrors, publicEvent, requireVersion, sanitizeDescription, ticketsFor, writeLifecycle } from "./events.js";
import { mediaUpload, uploadMedia } from "./media.js";

type Reminder = { channel: "email" | "push" | "sms"; offset: "7 days before" | "1 day before" | "1 hour before" | "Event start time"; scheduledAt: string; status: "scheduled" | "ready" };

function domainEvent(event: DbEvent, tickets: TicketType[] = []): Event {
  return publicEvent(event, tickets, true) as unknown as Event;
}

async function organizerFor(user: User): Promise<Organizer> {
  if (user.role !== "organizer" || !user.organizerSlug) throw new HttpError(403, "Organizer membership required");
  const organizer = await prisma.organizer.findUnique({ where: { slug: user.organizerSlug } });
  if (!organizer) throw new HttpError(409, "Organizer profile is missing. Contact support.");
  return organizer;
}

function registrationReminders(event: DbEvent, user: User): Reminder[] {
  const preferences = user.notifications as { email?: boolean; push?: boolean; smsReady?: boolean };
  const offsets: Array<[Reminder["offset"], number]> = [["7 days before", 604800000], ["1 day before", 86400000], ["1 hour before", 3600000], ["Event start time", 0]];
  const channels: Reminder["channel"][] = [];
  if (preferences.email) channels.push("email");
  if (preferences.push) channels.push("push");
  if (preferences.smsReady) channels.push("sms");
  return offsets.flatMap(([offset, milliseconds]) => channels.map((channel) => ({ channel, offset, scheduledAt: new Date(new Date(event.startsAt).getTime() - milliseconds).toISOString(), status: "scheduled" })));
}

function eventCalendarLinks(request: Request, event: { slug: string; title: string; summary: string; venue: string; startsAt: string }) {
  const origin = `${request.protocol}://${request.get("host")}`;
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 7200000);
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const google = new URLSearchParams({ action: "TEMPLATE", text: event.title, details: event.summary, location: event.venue, dates: `${format(start)}/${format(end)}` });
  const outlook = new URLSearchParams({ subject: event.title, body: event.summary, location: event.venue, startdt: start.toISOString(), enddt: end.toISOString() });
  return { google: `https://calendar.google.com/calendar/render?${google}`, outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&${outlook}`, apple: `${origin}/api/calendar/${event.slug}.ics` };
}

function buildIcs(event: Event) {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 7200000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const clean = (value: string) => value.replace(/[\r\n]/g, " ").replace(/[,;]/g, "\\$&");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Voryn//Events//EN", "BEGIN:VEVENT", `UID:${event.id}@voryn`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${clean(event.title)}`, `DESCRIPTION:${clean(event.summary)}`, `LOCATION:${clean(event.venue)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

async function participantModel(user: User, request: Request) {
  const registrations = await prisma.registration.findMany({ where: { userId: user.id } });
  const eventSlugs = registrations.map((item) => item.eventSlug);
  const [registeredEvents, favorites, following, reviews] = await Promise.all([
    prisma.event.findMany({ where: { slug: { in: eventSlugs }, deletedAt: null } }),
    prisma.event.findMany({ where: { slug: { in: user.favorites }, deletedAt: null } }),
    prisma.organizer.findMany({ where: { slug: { in: user.following } } }),
    prisma.review.findMany({ where: { userId: user.id } })
  ]);
  const now = Date.now();
  const history = registeredEvents.map((event) => domainEvent(event));
  return {
    user: safeUser(user), favorites: favorites.map((event) => domainEvent(event)), following, registrations,
    upcoming: history.filter((event) => new Date(event.startsAt).getTime() >= now && event.status !== "cancelled"),
    past: history.filter((event) => new Date(event.startsAt).getTime() < now || event.status === "completed"),
    history, reminders: registrations.filter((registration) => registration.status === "active").flatMap((registration) => registration.reminders as Reminder[]), reviews,
    calendar: Object.fromEntries(history.map((event) => [event.slug, eventCalendarLinks(request, event)]))
  };
}

async function organizerModel(user: User) {
  const organizer = await organizerFor(user);
  const dbEvents = await prisma.event.findMany({ where: { organizerSlug: organizer.slug, deletedAt: null } });
  const eventSlugs = dbEvents.map((event) => event.slug);
  const [registrations, announcements, ticketTypes] = await Promise.all([
    prisma.registration.findMany({ where: { eventSlug: { in: eventSlugs }, status: "active" } }),
    prisma.announcement.findMany({ where: { organizerSlug: organizer.slug } }),
    prisma.ticketType.findMany({ where: { eventId: { in: dbEvents.map((event) => event.id) } }, orderBy: { sortOrder: "asc" } })
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: registrations.map((registration) => registration.userId) } } });
  const userById = new Map(users.map((attendee) => [attendee.id, attendee]));
  const eventList = dbEvents.map((event) => domainEvent(event, ticketTypes.filter((ticket) => ticket.eventId === event.id)));
  return {
    user: safeUser(user), organizer, events: eventList,
    overview: { events: eventList.length, attendees: eventList.reduce((sum, event) => sum + event.attendeeCount, 0), registrations: registrations.length, ticketSales: eventList.reduce((sum, event) => sum + event.ticketSalesCount, 0), revenue: null },
    analytics: eventList.map((event) => ({ eventSlug: event.slug, title: event.title, attendeeCount: event.attendeeCount, rsvpCount: event.rsvpCount, ticketSalesCount: event.ticketSalesCount, revenue: null, conversionRate: null })),
    attendees: registrations.flatMap((registration) => { const attendee = userById.get(registration.userId); return attendee ? [{ ...registration, user: safeUser(attendee) }] : []; }),
    revenue: { total: null, byEvent: eventList.map((event) => ({ eventSlug: event.slug, title: event.title, revenue: null })) }, announcements
  };
}

async function registerForEvent(user: User, slug: string, options: { ticketTypeId?: string; quantity?: number; answers?: Record<string, unknown> } = {}) {
  const existing = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: slug } } });
  if (existing) throw new HttpError(409, existing.status === "active" ? "Already registered for this event" : "This registration was previously cancelled");
  let event: DbEvent | null = null;
  let selectedTicket: TicketType | null = null;
  let reserved = false;
  let ticketReserved = false;
  const quantity = Math.max(1, Math.min(Number(options.quantity ?? 1), 100));
  for (let attempt = 0; attempt < 5 && !reserved; attempt += 1) {
    event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.deletedAt) throw new HttpError(404, "Event not found");
    if (event.status !== "published") throw new HttpError(409, "Event is not open for registration");
    const settings = (event.registration ?? { mode: "free" }) as { mode?: string; opensAt?: string; closesAt?: string; questions?: Array<{ id: string; required?: boolean; label: string }> };
    const now = new Date();
    if (settings.mode === "disabled") throw new HttpError(409, "Registration is disabled for this event");
    if (settings.mode === "paid") throw new HttpError(409, "Online checkout is not available yet. No paid ticket has been issued.");
    if (settings.mode === "invite_only") throw new HttpError(403, "This event is invite-only");
    if (settings.opensAt && now < new Date(settings.opensAt)) throw new HttpError(409, "Registration has not opened yet");
    if (settings.closesAt && now > new Date(settings.closesAt)) throw new HttpError(409, "Registration has closed");
    for (const question of settings.questions ?? []) if (question.required && (options.answers?.[question.id] === undefined || options.answers?.[question.id] === "")) throw new HttpError(422, `Answer required: ${question.label}`);
    const tickets = await ticketsFor(event.id);
    selectedTicket = options.ticketTypeId ? tickets.find((ticket) => ticket.id === options.ticketTypeId) ?? null : tickets.find((ticket) => ticket.visibility === "public" && ticket.availability === "available") ?? null;
    if (tickets.length && !selectedTicket) throw new HttpError(422, "Choose an available ticket type");
    if (selectedTicket) {
      if (quantity < selectedTicket.minPerOrder || quantity > selectedTicket.maxPerOrder) throw new HttpError(422, "Ticket quantity is outside the allowed order limits");
      if (selectedTicket.priceMinor > 0) throw new HttpError(409, "Paid checkout is not available yet. No ticket has been issued.");
      if (selectedTicket.salesOpenAt && now < selectedTicket.salesOpenAt) throw new HttpError(409, "Ticket sales have not opened yet");
      if (selectedTicket.salesCloseAt && now > selectedTicket.salesCloseAt) throw new HttpError(409, "Ticket sales have closed");
      if (selectedTicket.capacity !== null && selectedTicket.reservedCount + quantity > selectedTicket.capacity) throw new HttpError(409, "Ticket capacity has been reached");
    }
    if (event.capacity !== null && event.reservedCount + quantity > event.capacity) throw new HttpError(409, "Event capacity has been reached");
    const result = await prisma.event.updateMany({ where: { id: event.id, status: "published", deletedAt: null, reservedCount: event.reservedCount }, data: { reservedCount: { increment: quantity }, rsvpCount: { increment: quantity } } });
    reserved = result.count === 1;
  }
  if (!event || !reserved) throw new HttpError(409, "Registration capacity changed; please try again");
  try {
    if (selectedTicket) {
      const ticketResult = await prisma.ticketType.updateMany({ where: { id: selectedTicket.id, reservedCount: selectedTicket.reservedCount }, data: { reservedCount: { increment: quantity } } });
      if (ticketResult.count !== 1) throw new HttpError(409, "Ticket availability changed; please try again");
      ticketReserved = true;
    }
    const settings = (event.registration ?? { mode: "free" }) as { mode?: string; approvalRequired?: boolean };
    const approvalStatus = settings.mode === "approval" || settings.approvalRequired ? "pending" : "approved";
    const ticketCode = createTicketCode();
    const registration = await prisma.registration.create({ data: { userId: user.id, eventId: event.id, eventSlug: event.slug, ticketTypeId: selectedTicket?.id, quantity, answers: options.answers as Prisma.InputJsonValue | undefined, approvalStatus, paymentStatus: "not_required", registeredAt: new Date().toISOString(), checkedIn: false, ticketCode, reminders: registrationReminders(event, user) as unknown as Prisma.InputJsonValue, status: "active" } });
    if (approvalStatus === "approved") await prisma.ticket.create({ data: { registrationId: registration.id, eventId: event.id, ticketTypeId: selectedTicket?.id, codeHash: hashToken(ticketCode), displayCode: ticketCode } });
    const cached = cachedEvents.find((item) => item.slug === slug);
    if (cached) cached.rsvpCount += quantity;
    return registration;
  } catch (error) {
    await prisma.event.update({ where: { id: event.id }, data: { reservedCount: { decrement: quantity }, rsvpCount: { decrement: quantity } } }).catch(() => undefined);
    if (selectedTicket && ticketReserved) await prisma.ticketType.update({ where: { id: selectedTicket.id }, data: { reservedCount: { decrement: quantity } } }).catch(() => undefined);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new HttpError(409, "Already registered for this event");
    throw error;
  }
}

async function sendResetEmail(email: string, token: string) {
  const endpoint = process.env.EMAIL_WEBHOOK_URL;
  if (!endpoint) throw new HttpError(503, "Password reset email delivery is not configured");
  const resetUrl = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/reset-password?token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ template: "password-reset", to: email, resetUrl }) });
  if (!response.ok) throw new HttpError(503, "Password reset email delivery is temporarily unavailable");
}

async function syncTickets(event: DbEvent, requested: Array<Record<string, unknown>>) {
  const existing = await ticketsFor(event.id);
  const requestedIds = new Set(requested.flatMap((ticket) => typeof ticket.id === "string" ? [ticket.id] : []));
  for (const ticket of existing) {
    if (!requestedIds.has(ticket.id) && ticket.reservedCount > 0) throw new HttpError(409, `${ticket.name} cannot be removed because registrations use it`);
  }
  for (const ticket of requested) {
    const current = typeof ticket.id === "string" ? existing.find((item) => item.id === ticket.id) : undefined;
    if (current && typeof ticket.capacity === "number" && ticket.capacity < current.reservedCount) throw new HttpError(409, `${current.name} capacity cannot be below confirmed reservations`);
  }
  const removable = existing.filter((ticket) => !requestedIds.has(ticket.id));
  if (removable.length) await prisma.ticketType.deleteMany({ where: { id: { in: removable.map((ticket) => ticket.id) } } });
  await Promise.all(requested.map((ticket, index) => {
    const data = {
      name: String(ticket.name), description: String(ticket.description ?? ""), currency: String(ticket.currency ?? "NGN"), priceMinor: Number(ticket.priceMinor ?? 0),
      capacity: ticket.capacity === null || ticket.capacity === undefined ? null : Number(ticket.capacity), minPerOrder: Number(ticket.minPerOrder ?? 1), maxPerOrder: Number(ticket.maxPerOrder ?? 1),
      salesOpenAt: ticket.salesOpenAt ? new Date(String(ticket.salesOpenAt)) : null, salesCloseAt: ticket.salesCloseAt ? new Date(String(ticket.salesCloseAt)) : null,
      visibility: String(ticket.visibility ?? "public"), availability: String(ticket.availability ?? "available"), eligibility: ticket.eligibility ? String(ticket.eligibility) : null, sortOrder: Number(ticket.sortOrder ?? index)
    };
    const current = typeof ticket.id === "string" ? existing.find((item) => item.id === ticket.id) : undefined;
    return current ? prisma.ticketType.update({ where: { id: current.id }, data }) : prisma.ticketType.create({ data: { ...data, eventId: event.id } });
  }));
  return ticketsFor(event.id);
}

function eventData(input: Record<string, unknown>, existing?: DbEvent) {
  const location = input.location as Record<string, unknown> | undefined;
  const media = (existing?.media ?? {}) as Record<string, unknown>;
  const start = typeof input.startsAt === "string" ? input.startsAt : existing?.startsAt ?? new Date(Date.now() + 7 * 86400000).toISOString();
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : existing?.title ?? "Untitled event";
  const summary = typeof input.shortSummary === "string" ? input.shortSummary : typeof input.summary === "string" ? input.summary : existing?.summary ?? "Draft event";
  const nextMedia = { ...media, coverImage: input.coverImage ?? media.coverImage ?? "", heroImage: input.heroImage ?? media.heroImage ?? "", thumbnail: input.thumbnail ?? media.thumbnail ?? "", gallery: input.gallery ?? media.gallery ?? [], videoTrailer: input.videoTrailer ?? media.videoTrailer ?? "" };
  return {
    title, summary, shortSummary: typeof input.shortSummary === "string" ? input.shortSummary : summary,
    descriptionHtml: sanitizeDescription(typeof input.descriptionHtml === "string" ? input.descriptionHtml : undefined), category: input.category as string | undefined,
    type: input.type as string | undefined, mode: input.mode as string | undefined, tags: input.tags as string[] | undefined, language: input.language as string | undefined,
    targetAudience: input.targetAudience as string | undefined, visibility: input.visibility as string | undefined, attendanceFormat: input.attendanceFormat as string | undefined,
    startsAt: start, endsAt: input.endsAt === null ? null : typeof input.endsAt === "string" ? new Date(input.endsAt) : undefined, timezone: input.timezone as string | undefined,
    citySlug: (input.citySlug as string | undefined) ?? (location?.city ? slugify(String(location.city)) : undefined), country: (input.country as string | undefined) ?? (location?.country ? String(location.country) : undefined),
    venue: (input.venue as string | undefined) ?? (location?.venueName ? String(location.venueName) : undefined), schedule: input.schedule as Prisma.InputJsonValue | undefined,
    recurrence: input.recurrence === null ? null : input.recurrence as Prisma.InputJsonValue | undefined, location: input.location as Prisma.InputJsonValue | undefined,
    registration: input.registration as Prisma.InputJsonValue | undefined, faqs: input.faqs as Prisma.InputJsonValue | undefined, speakers: input.speakers as Prisma.InputJsonValue | undefined,
    advancedSettings: input.advancedSettings as Prisma.InputJsonValue | undefined, capacity: input.capacity as number | null | undefined, priceLabel: input.priceLabel as string | undefined,
    publishAt: input.publishAt === null ? null : typeof input.publishAt === "string" ? new Date(input.publishAt) : undefined, media: nextMedia as Prisma.InputJsonValue
  };
}

export function registerPortalRoutes(app: Express) {
  app.post("/api/auth/signup", asyncHandler(async (request, response) => {
    const input = signupSchema.parse(request.body);
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new HttpError(422, passwordError);
    const email = normalizeEmail(input.email);
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "An account with this email already exists");
    let organizer: Organizer | undefined;
    if (input.role === "organizer") {
      const slugs = new Set((await prisma.organizer.findMany({ select: { slug: true } })).map(({ slug }) => slug));
      organizer = await prisma.organizer.create({ data: { name: input.name, slug: uniqueSlug(input.name, slugs), profileImage: "", coverImage: "", bio: "", website: "", socials: {}, followers: 0, totalAttendeesHosted: 0 } });
    }
    try {
      const user = await prisma.user.create({ data: { name: input.name, email, passwordHash: await hashPassword(input.password), role: input.role, lastDashboard: input.role, organizerSlug: organizer?.slug, favorites: [], following: [], notifications: { email: true, push: true, smsReady: false } } });
      await createSession(response, user.id);
      if (organizer) cachedOrganizers.push({ ...organizer, socials: organizer.socials } as never);
      response.status(201).json({ user: safeUser(user) });
    } catch (error) {
      if (organizer) await prisma.organizer.delete({ where: { id: organizer.id } }).catch(() => undefined);
      throw error;
    }
  }));

  const login = asyncHandler(async (request, response) => {
    const input = loginSchema.parse(request.body);
    let user = await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } });
    const hasCurrentHash = Boolean(user && isPasswordHash(user.passwordHash));
    const passwordMatches = Boolean(user && (hasCurrentHash
      ? await verifyPassword(input.password, user.passwordHash)
      : verifyLegacyPassword(input.password, user.passwordHash)));
    if (!user || !passwordMatches) throw new HttpError(401, "Invalid email or password");
    if (request.path.includes("/admin/") !== (user.role === "admin")) throw new HttpError(401, "Invalid email or password");
    if (!hasCurrentHash) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password), passwordResetRequired: false }
      });
    }
    await revokeSession(request, response);
    await createSession(response, user.id);
    response.json({ user: safeUser(user) });
  });
  app.post("/api/auth/login", login);
  app.post("/api/admin/auth/login", login);
  app.post("/api/admin/auth/signup", (_request, response) => response.status(404).json({ error: "Route not found" }));
  app.post("/api/auth/logout", asyncHandler(async (request, response) => { await revokeSession(request, response); response.status(204).send(); }));
  app.get("/api/auth/me", asyncHandler(async (request, response) => { const user = await currentUser(request); response.json({ user: user ? safeUser(user) : null }); }));

  app.post("/api/auth/password-reset/request", asyncHandler(async (request, response) => {
    const { email: rawEmail } = resetRequestSchema.parse(request.body);
    if (!process.env.EMAIL_WEBHOOK_URL) throw new HttpError(503, "Password reset email delivery is not configured");
    const email = normalizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = createOpaqueToken();
      await prisma.passwordResetToken.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
      await sendResetEmail(email, token);
    }
    response.status(202).json({ message: "If an eligible account exists, reset instructions will be delivered." });
  }));
  app.post("/api/auth/password-reset/confirm", asyncHandler(async (request, response) => {
    const input = resetConfirmSchema.parse(request.body);
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new HttpError(422, passwordError);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new HttpError(400, "Reset token is invalid or expired");
    const claimed = await prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new HttpError(400, "Reset token is invalid or expired");
    await prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(input.password), passwordResetRequired: false } });
    await prisma.session.deleteMany({ where: { userId: record.userId } });
    response.json({ success: true });
  }));
  app.post("/api/auth/password/change", requireAuth, asyncHandler(async (request, response) => {
    const input = changePasswordSchema.parse(request.body);
    const user = response.locals.user as User;
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new HttpError(401, "Invalid email or password");
    const passwordError = validatePassword(input.newPassword);
    if (passwordError) throw new HttpError(422, passwordError);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword), passwordResetRequired: false } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await createSession(response, user.id);
    response.json({ success: true });
  }));

  app.post("/api/auth/switch-dashboard", requireAuth, asyncHandler(async (request, response) => {
    const { dashboard } = dashboardSchema.parse(request.body);
    const user = response.locals.user as User;
    const allowed = user.role === "admin" ? ["admin"] : user.role === "organizer" ? ["participant", "organizer"] : ["participant"];
    if (!allowed.includes(dashboard)) throw new HttpError(403, "Dashboard is not available for this account");
    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastDashboard: dashboard } });
    response.json({ user: safeUser(updated) });
  }));

  app.get("/api/portal/participant", requireParticipantAccess, asyncHandler(async (request, response) => response.json(await participantModel(response.locals.user as User, request))));
  app.post("/api/portal/participant/favorites/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const slug = String(request.params.slug);
    if (!(await prisma.event.findFirst({ where: { slug, deletedAt: null } }))) throw new HttpError(404, "Event not found");
    const favorites = [...new Set([...user.favorites, slug])];
    const updated = await prisma.user.update({ where: { id: user.id }, data: { favorites } });
    response.json(await participantModel(updated, request));
  }));
  app.delete("/api/portal/participant/favorites/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const updated = await prisma.user.update({ where: { id: user.id }, data: { favorites: user.favorites.filter((slug) => slug !== request.params.slug) } });
    response.json(await participantModel(updated, request));
  }));
  app.post("/api/portal/participant/register/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const registration = await registerForEvent(user, String(request.params.slug), request.body ?? {});
    response.status(201).json({ registration, dashboard: await participantModel(user, request) });
  }));
  app.delete("/api/portal/participant/register/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const registration = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: String(request.params.slug) } } });
    if (!registration || registration.status !== "active") throw new HttpError(404, "Active registration not found");
    await prisma.registration.update({ where: { id: registration.id }, data: { status: "cancelled", cancelledAt: new Date().toISOString() } });
    await prisma.event.updateMany({ where: { slug: registration.eventSlug, reservedCount: { gte: registration.quantity }, rsvpCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity }, rsvpCount: { decrement: registration.quantity } } });
    if (registration.ticketTypeId) await prisma.ticketType.updateMany({ where: { id: registration.ticketTypeId, reservedCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity } } });
    const cached = cachedEvents.find((event) => event.slug === registration.eventSlug);
    if (cached) cached.rsvpCount = Math.max(0, cached.rsvpCount - registration.quantity);
    response.json({ success: true, dashboard: await participantModel(user, request) });
  }));
  app.get("/api/portal/participant/tickets/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const slug = String(request.params.slug);
    const registration = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: slug } } });
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!registration || registration.status !== "active" || registration.approvalStatus !== "approved" || registration.paymentStatus === "pending" || !event) throw new HttpError(404, "Ticket not found");
    response.type("text/plain").send(`Voryn Ticket\n${event.title}\n${event.startsAt}\n${event.venue}\nCode: ${registration.ticketCode}`);
  }));
  app.post("/api/portal/participant/reviews/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = reviewSchema.parse(request.body);
    const slug = String(request.params.slug);
    const registration = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: slug } } });
    if (!registration) throw new HttpError(403, "Only registered attendees can review this event");
    await prisma.review.create({ data: { userId: user.id, eventSlug: slug, rating: input.rating, comment: input.comment, createdAt: new Date().toISOString() } });
    response.json(await participantModel(user, request));
  }));
  app.post("/api/portal/participant/follow/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const organizer = await prisma.organizer.findUnique({ where: { slug: String(request.params.slug) } });
    if (!organizer) throw new HttpError(404, "Organizer not found");
    if (!user.following.includes(organizer.slug)) {
      await prisma.user.update({ where: { id: user.id }, data: { following: [...user.following, organizer.slug] } });
      await prisma.organizer.update({ where: { id: organizer.id }, data: { followers: { increment: 1 } } });
    }
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    response.json(await participantModel(updated, request));
  }));
  app.put("/api/portal/participant/notifications", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const notifications = { email: Boolean(request.body.email), push: Boolean(request.body.push), smsReady: Boolean(request.body.smsReady) };
    const updated = await prisma.user.update({ where: { id: user.id }, data: { notifications } });
    response.json(await participantModel(updated, request));
  }));
  app.put("/api/portal/participant/profile", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = profileSchema.parse(request.body);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { name: input.name, email: normalizeEmail(input.email), profileImage: input.profileImage } });
    response.json(await participantModel(updated, request));
  }));

  app.get("/api/portal/organizer", requireOrganizer, requireOrganizationPermission, asyncHandler(async (_request, response) => response.json(await organizerModel(response.locals.user as User))));
  app.post("/api/portal/organizer/media", requireOrganizer, requireOrganizationPermission, mediaUpload, asyncHandler(uploadMedia));
  app.put("/api/portal/organizer/profile", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const input = organizerProfileSchema.parse(request.body);
    const user = response.locals.user as User;
    const organizer = await organizerFor(user);
    const [updatedUser] = await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { name: input.name, profileImage: input.profileImage } }),
      prisma.organizer.update({ where: { id: organizer.id }, data: { name: input.organizerName, bio: input.bio, website: input.website, profileImage: input.profileImage ?? organizer.profileImage } })
    ]);
    response.json(await organizerModel(updatedUser));
  }));
  app.post("/api/portal/organizer/events", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const input = eventCreateSchema.parse(request.body);
    const user = response.locals.user as User;
    const organizer = await organizerFor(user);
    const slugs = new Set((await prisma.event.findMany({ select: { slug: true } })).map(({ slug }) => slug));
    const requestedSlug = input.slug || input.title || "untitled-event";
    const data = eventData(input as unknown as Record<string, unknown>);
    const created = await prisma.event.create({ data: { ...data, title: data.title, slug: uniqueSlug(requestedSlug, slugs), summary: data.summary, category: data.category ?? "Uncategorized", type: data.type ?? "other", mode: data.mode ?? "local", status: "draft", startsAt: data.startsAt, venue: data.venue ?? "TBA", citySlug: data.citySlug ?? "unassigned", country: data.country ?? "", organizerSlug: organizer.slug, attendeeCount: 0, rsvpCount: 0, ticketSalesCount: 0, badges: ["recently-added"], priceLabel: data.priceLabel ?? "Free", capacity: data.capacity, reservedCount: 0, visibility: data.visibility ?? "public", attendanceFormat: data.attendanceFormat ?? "physical", timezone: data.timezone ?? "UTC", version: 1 } as Prisma.EventCreateInput });
    const tickets = input.tickets ? await syncTickets(created, input.tickets as unknown as Array<Record<string, unknown>>) : [];
    await writeLifecycle(created, user, "created", undefined, { status: "draft" });
    const event = domainEvent(created, tickets);
    addEventToStore(event);
    response.status(201).json({ event, dashboard: await organizerModel(user) });
  }));
  app.put("/api/portal/organizer/events/:slug", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (request, response) => {
    const input = eventUpdateSchema.parse(request.body);
    const existing = response.locals.event as DbEvent;
    requireVersion(existing.version, input.version);
    if (input.status && input.status !== existing.status) throw new HttpError(422, "Use the lifecycle endpoint to change publication status");
    if (input.capacity !== undefined && input.capacity !== null && input.capacity < existing.reservedCount) throw new HttpError(409, "Capacity cannot be lower than active registrations");
    const scheduleChanged = (input.startsAt && input.startsAt !== existing.startsAt) || (input.endsAt !== undefined && input.endsAt !== existing.endsAt?.toISOString());
    if (existing.status === "published" && scheduleChanged && !input.confirmMajorChange && await prisma.registration.count({ where: { eventSlug: existing.slug, status: "active" } })) throw new HttpError(409, "Confirm this major schedule change before saving; registered attendees may need notification");
    const requestedSlug = input.slug && input.slug !== existing.slug ? input.slug : undefined;
    if (requestedSlug && await prisma.event.findFirst({ where: { slug: requestedSlug, id: { not: existing.id } } })) throw new HttpError(409, "That event slug is already in use");
    const data = eventData(input as unknown as Record<string, unknown>, existing);
    const saved = await prisma.event.updateMany({ where: { id: existing.id, version: existing.version }, data: { ...data, slug: requestedSlug, previousSlugs: requestedSlug ? [...existing.previousSlugs, existing.slug] : undefined, version: { increment: 1 } } as Prisma.EventUpdateInput });
    if (saved.count !== 1) throw new HttpError(409, "This event changed in another session. Reload before saving again.");
    const updated = await prisma.event.findUniqueOrThrow({ where: { id: existing.id } });
    const tickets = input.tickets ? await syncTickets(updated, input.tickets as unknown as Array<Record<string, unknown>>) : await ticketsFor(updated.id);
    await writeLifecycle(updated, response.locals.user as User, "updated", { version: existing.version, startsAt: existing.startsAt, endsAt: existing.endsAt?.toISOString(), status: existing.status }, { version: updated.version, startsAt: updated.startsAt, endsAt: updated.endsAt?.toISOString(), status: updated.status });
    const event = domainEvent(updated, tickets);
    const cached = cachedEvents.find((item) => item.slug === event.slug);
    if (cached) Object.assign(cached, event); else addEventToStore(event);
    if (requestedSlug) removeEventFromStore(existing.slug);
    updateEventVisibility(event);
    response.json({ event, dashboard: await organizerModel(response.locals.user as User) });
  }));
  app.post("/api/portal/organizer/events/:slug/lifecycle", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (request, response) => {
    const input = lifecycleSchema.parse(request.body); const existing = response.locals.event as DbEvent; const user = response.locals.user as User;
    requireVersion(existing.version, input.version);
    const allowed: Record<string, string[]> = { draft: ["publish", "schedule", "trash"], scheduled: ["publish", "unpublish", "cancel", "trash"], published: ["unpublish", "cancel", "complete"], cancelled: ["archive"], completed: ["archive"], archived: ["restore", "trash"], trashed: ["restore"] };
    if (!allowed[existing.status]?.includes(input.action)) throw new HttpError(409, `Cannot ${input.action} an event in ${existing.status} status`);
    let status = existing.status; const now = new Date(); const data: Prisma.EventUpdateInput = { version: { increment: 1 } };
    if (input.action === "publish") { const errors = publicationErrors(existing, await ticketsFor(existing.id)); if (errors.length) return response.status(422).json({ error: "Event is not ready to publish", validationErrors: errors }); status = "published"; Object.assign(data, { publishedAt: now, publishAt: null }); }
    if (input.action === "schedule") { if (!input.publishAt || new Date(input.publishAt) <= now) throw new HttpError(422, "Scheduled publication must be in the future"); const candidate = { ...existing, publishAt: new Date(input.publishAt) } as DbEvent; const errors = publicationErrors(candidate, await ticketsFor(existing.id)); if (errors.length) return response.status(422).json({ error: "Event is not ready to schedule", validationErrors: errors }); status = "scheduled"; Object.assign(data, { publishAt: new Date(input.publishAt) }); }
    if (input.action === "unpublish") { status = "draft"; Object.assign(data, { publishAt: null }); }
    if (input.action === "cancel") { status = "cancelled"; Object.assign(data, { cancelledAt: now, cancellationReason: input.reason ?? null, publishAt: null }); }
    if (input.action === "complete") status = "completed";
    if (input.action === "archive") { status = "archived"; Object.assign(data, { archivedAt: now }); }
    if (input.action === "trash") { status = "trashed"; Object.assign(data, { trashedAt: now }); }
    if (input.action === "restore") { status = existing.trashedAt ? "draft" : "completed"; Object.assign(data, { trashedAt: null, archivedAt: null }); }
    const changed = await prisma.event.updateMany({ where: { id: existing.id, version: existing.version }, data: { ...data, status } });
    if (changed.count !== 1) throw new HttpError(409, "This event changed in another session. Reload before trying again.");
    const updated = await prisma.event.findUniqueOrThrow({ where: { id: existing.id } });
    await writeLifecycle(updated, user, input.action, { status: existing.status }, { status });
    const event = domainEvent(updated, await ticketsFor(updated.id)); const cached = cachedEvents.find((item) => item.slug === event.slug); if (cached) Object.assign(cached, event); else addEventToStore(event); updateEventVisibility(event);
    response.json({ event, dashboard: await organizerModel(user) });
  }));
  app.post("/api/portal/organizer/events/:slug/duplicate", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (_request, response) => {
    const source = response.locals.event as DbEvent; const user = response.locals.user as User; const existingSlugs = new Set((await prisma.event.findMany({ select: { slug: true } })).map((item) => item.slug));
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, publishedAt: _publishedAt, publishAt: _publishAt, cancelledAt: _cancelledAt, cancellationReason: _reason, archivedAt: _archivedAt, trashedAt: _trashedAt, ...copy } = source;
    const duplicate = await prisma.event.create({ data: { ...copy, title: `${source.title} (Copy)`, slug: uniqueSlug(`${source.slug}-copy`, existingSlugs), status: "draft", attendeeCount: 0, rsvpCount: 0, ticketSalesCount: 0, reservedCount: 0, version: 1, previousSlugs: [] } as Prisma.EventCreateInput });
    const sourceTickets = await ticketsFor(source.id); const tickets = await Promise.all(sourceTickets.map((ticket) => prisma.ticketType.create({ data: { eventId: duplicate.id, name: ticket.name, description: ticket.description, currency: ticket.currency, priceMinor: ticket.priceMinor, capacity: ticket.capacity, reservedCount: 0, minPerOrder: ticket.minPerOrder, maxPerOrder: ticket.maxPerOrder, salesOpenAt: ticket.salesOpenAt, salesCloseAt: ticket.salesCloseAt, visibility: ticket.visibility, availability: ticket.availability, eligibility: ticket.eligibility, sortOrder: ticket.sortOrder } })));
    await writeLifecycle(duplicate, user, "created", undefined, { duplicatedFrom: source.id }); response.status(201).json({ event: domainEvent(duplicate, tickets), dashboard: await organizerModel(user) });
  }));
  app.delete("/api/portal/organizer/events/:slug", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (request, response) => {
    const event = response.locals.event as DbEvent; const version = Number(request.query.version); requireVersion(event.version, Number.isFinite(version) ? version : undefined);
    const registrationCount = await prisma.registration.count({ where: { eventSlug: event.slug } });
    if (registrationCount > 0) throw new HttpError(409, "Events with registration history must be retained; move the event to trash instead");
    if (event.status !== "trashed") throw new HttpError(409, "Move the event to trash before permanent deletion");
    await prisma.ticketType.deleteMany({ where: { eventId: event.id } }); await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date() } }); await writeLifecycle(event, response.locals.user as User, "deleted", { status: event.status }, undefined);
    removeEventFromStore(event.slug); response.json({ dashboard: await organizerModel(response.locals.user as User) });
  }));
  app.post("/api/portal/organizer/announcements", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const input = announcementSchema.parse(request.body);
    const user = response.locals.user as User;
    const organizer = await organizerFor(user);
    const event = await prisma.event.findFirst({ where: { slug: input.eventSlug, organizerSlug: organizer.slug, deletedAt: null } });
    if (!event) throw new HttpError(403, "Event does not belong to this organizer");
    const announcement = await prisma.announcement.create({ data: { ...input, organizerSlug: organizer.slug, sentAt: new Date().toISOString() } });
    response.json({ announcement, dashboard: await organizerModel(user) });
  }));
  app.post("/api/portal/organizer/registrations/:id/approval", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const decision = request.body?.decision; if (decision !== "approved" && decision !== "rejected") throw new HttpError(422, "Decision must be approved or rejected");
    const user = response.locals.user as User; const registration = await prisma.registration.findUnique({ where: { id: String(request.params.id) } });
    if (!registration) throw new HttpError(404, "Registration not found");
    const event = await prisma.event.findFirst({ where: { slug: registration.eventSlug, organizerSlug: user.organizerSlug ?? "", deletedAt: null } });
    if (!event) throw new HttpError(403, "Registration does not belong to this organizer");
    if (registration.approvalStatus !== "pending") throw new HttpError(409, "Registration has already been decided");
    await prisma.registration.update({ where: { id: registration.id }, data: { approvalStatus: decision, status: decision === "rejected" ? "rejected" : "active" } });
    if (decision === "rejected") {
      await prisma.event.updateMany({ where: { id: event.id, reservedCount: { gte: registration.quantity }, rsvpCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity }, rsvpCount: { decrement: registration.quantity } } });
      if (registration.ticketTypeId) await prisma.ticketType.updateMany({ where: { id: registration.ticketTypeId, reservedCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity } } });
    }
    response.json({ dashboard: await organizerModel(user) });
  }));
  app.get("/api/portal/organizer/attendees/export", requireOrganizer, requireOrganizationPermission, asyncHandler(async (_request, response) => {
    const model = await organizerModel(response.locals.user as User);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = ["eventSlug,name,email,ticketCode,registeredAt", ...model.attendees.map((attendee) => [attendee.eventSlug, attendee.user.name, attendee.user.email, attendee.ticketCode, attendee.registeredAt].map(escape).join(","))];
    response.header("Content-Type", "text/csv").attachment("voryn-attendees.csv").send(rows.join("\n"));
  }));

  app.get("/api/portal/admin", requireAdmin, asyncHandler(async (request, response) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const take = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
    const [users, organizers, events, registrations, reports, counts] = await Promise.all([
      prisma.user.findMany({ skip: (page - 1) * take, take }), prisma.organizer.findMany({ take: 100 }), prisma.event.findMany({ where: { deletedAt: null }, take: 100 }),
      prisma.registration.findMany({ take: 100 }), prisma.review.findMany({ where: { rating: { lte: 2 } }, take: 100 }),
      Promise.all([prisma.user.count(), prisma.organizer.count(), prisma.event.count({ where: { deletedAt: null } }), prisma.registration.count({ where: { status: "active" } })])
    ]);
    response.json({ users: users.map(safeUser), organizers, events: events.map((event) => domainEvent(event)), registrations, reports, analytics: { users: counts[0], organizers: counts[1], events: counts[2], registrations: counts[3], revenue: null }, pagination: { page, limit: take } });
  }));

  app.get("/api/events/:slug/calendar", asyncHandler(async (request, response) => {
    const event = await prisma.event.findFirst({ where: { slug: String(request.params.slug), deletedAt: null, status: { not: "draft" } } });
    if (!event) throw new HttpError(404, "Event not found");
    response.json(eventCalendarLinks(request, event));
  }));
  app.get("/api/calendar/:slug.ics", asyncHandler(async (request, response) => {
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!event) throw new HttpError(404, "Event not found");
    response.header("Content-Type", "text/calendar").attachment(`${event.slug}.ics`).send(buildIcs(event));
  }));
}

export { currentUser, registerForEvent };
