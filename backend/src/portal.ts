import type { Express, Request } from "express";
import type { Event as DbEvent, Organizer, Prisma, Registration, User } from "@prisma/client";
import { addEventToStore, cities, events as cachedEvents, organizers as cachedOrganizers, publicEvents, removeEventFromStore, updateEventVisibility } from "./data.js";
import type { Event, EventStatus } from "./domain.js";
import { prisma } from "./db.js";
import { asyncHandler, HttpError } from "./http.js";
import { createOpaqueToken, createTicketCode, hashPassword, hashToken, isPasswordHash, normalizeEmail, validatePassword, verifyPassword } from "./security.js";
import { uniqueSlug } from "./slug.js";
import { announcementSchema, changePasswordSchema, dashboardSchema, eventCreateSchema, eventUpdateSchema, loginSchema, organizerProfileSchema, profileSchema, resetConfirmSchema, resetRequestSchema, reviewSchema, signupSchema } from "./validation.js";
import { createSession, currentUser, requireAdmin, requireAuth, requireEventOwnership, requireOrganizationPermission, requireOrganizer, requireParticipantAccess, revokeSession, safeUser } from "./auth.js";

type Reminder = { channel: "email" | "push" | "sms"; offset: "7 days before" | "1 day before" | "1 hour before" | "Event start time"; scheduledAt: string; status: "scheduled" | "ready" };

function domainEvent(event: DbEvent): Event {
  return {
    id: event.id, title: event.title, slug: event.slug, summary: event.summary,
    category: event.category as Event["category"], type: event.type as Event["type"], mode: event.mode as Event["mode"],
    status: event.status as Event["status"], startsAt: event.startsAt, venue: event.venue, citySlug: event.citySlug,
    country: event.country, organizerSlug: event.organizerSlug, media: event.media as Event["media"],
    attendeeCount: event.attendeeCount, rsvpCount: event.rsvpCount, ticketSalesCount: event.ticketSalesCount,
    badges: event.badges as Event["badges"], priceLabel: event.priceLabel
  };
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
  const registrations = await prisma.registration.findMany({ where: { userId: user.id, status: "active" } });
  const eventSlugs = registrations.map((item) => item.eventSlug);
  const [registeredEvents, favorites, following, reviews] = await Promise.all([
    prisma.event.findMany({ where: { slug: { in: eventSlugs }, deletedAt: null } }),
    prisma.event.findMany({ where: { slug: { in: user.favorites }, deletedAt: null } }),
    prisma.organizer.findMany({ where: { slug: { in: user.following } } }),
    prisma.review.findMany({ where: { userId: user.id } })
  ]);
  const now = Date.now();
  const history = registeredEvents.map(domainEvent);
  return {
    user: safeUser(user), favorites: favorites.map(domainEvent), following, registrations,
    upcoming: history.filter((event) => new Date(event.startsAt).getTime() >= now && event.status !== "cancelled"),
    past: history.filter((event) => new Date(event.startsAt).getTime() < now || event.status === "completed"),
    history, reminders: registrations.flatMap((registration) => registration.reminders as Reminder[]), reviews,
    calendar: Object.fromEntries(history.map((event) => [event.slug, eventCalendarLinks(request, event)]))
  };
}

async function organizerModel(user: User) {
  const organizer = await organizerFor(user);
  const dbEvents = await prisma.event.findMany({ where: { organizerSlug: organizer.slug, deletedAt: null } });
  const eventSlugs = dbEvents.map((event) => event.slug);
  const [registrations, announcements] = await Promise.all([
    prisma.registration.findMany({ where: { eventSlug: { in: eventSlugs }, status: "active" } }),
    prisma.announcement.findMany({ where: { organizerSlug: organizer.slug } })
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: registrations.map((registration) => registration.userId) } } });
  const userById = new Map(users.map((attendee) => [attendee.id, attendee]));
  const eventList = dbEvents.map(domainEvent);
  return {
    user: safeUser(user), organizer, events: eventList,
    overview: { events: eventList.length, attendees: eventList.reduce((sum, event) => sum + event.attendeeCount, 0), registrations: registrations.length, ticketSales: eventList.reduce((sum, event) => sum + event.ticketSalesCount, 0), revenue: null },
    analytics: eventList.map((event) => ({ eventSlug: event.slug, title: event.title, attendeeCount: event.attendeeCount, rsvpCount: event.rsvpCount, ticketSalesCount: event.ticketSalesCount, revenue: null, conversionRate: null })),
    attendees: registrations.flatMap((registration) => { const attendee = userById.get(registration.userId); return attendee ? [{ ...registration, user: safeUser(attendee) }] : []; }),
    revenue: { total: null, byEvent: eventList.map((event) => ({ eventSlug: event.slug, title: event.title, revenue: null })) }, announcements
  };
}

async function registerForEvent(user: User, slug: string) {
  const existing = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: slug } } });
  if (existing) throw new HttpError(409, existing.status === "active" ? "Already registered for this event" : "This registration was previously cancelled");
  let event: DbEvent | null = null;
  let reserved = false;
  for (let attempt = 0; attempt < 5 && !reserved; attempt += 1) {
    event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.deletedAt) throw new HttpError(404, "Event not found");
    if (event.status !== "published") throw new HttpError(409, "Event is not open for registration");
    if (event.capacity !== null && event.reservedCount >= event.capacity) throw new HttpError(409, "Event capacity has been reached");
    const result = await prisma.event.updateMany({ where: { id: event.id, status: "published", deletedAt: null, reservedCount: event.reservedCount }, data: { reservedCount: { increment: 1 }, rsvpCount: { increment: 1 } } });
    reserved = result.count === 1;
  }
  if (!event || !reserved) throw new HttpError(409, "Registration capacity changed; please try again");
  try {
    const registration = await prisma.registration.create({ data: { userId: user.id, eventSlug: event.slug, registeredAt: new Date().toISOString(), checkedIn: false, ticketCode: createTicketCode(), reminders: registrationReminders(event, user) as unknown as Prisma.InputJsonValue, status: "active" } });
    const cached = cachedEvents.find((item) => item.slug === slug);
    if (cached) cached.rsvpCount += 1;
    return registration;
  } catch (error) {
    await prisma.event.update({ where: { id: event.id }, data: { reservedCount: { decrement: 1 }, rsvpCount: { decrement: 1 } } }).catch(() => undefined);
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
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } });
    if (!user || !isPasswordHash(user.passwordHash) || !(await verifyPassword(input.password, user.passwordHash))) {
      if (user && !isPasswordHash(user.passwordHash)) await prisma.user.update({ where: { id: user.id }, data: { passwordResetRequired: true } });
      throw new HttpError(401, "Invalid email or password");
    }
    if (request.path.includes("/admin/") !== (user.role === "admin")) throw new HttpError(401, "Invalid email or password");
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
    const registration = await registerForEvent(user, String(request.params.slug));
    response.status(201).json({ registration, dashboard: await participantModel(user, request) });
  }));
  app.delete("/api/portal/participant/register/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const registration = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: String(request.params.slug) } } });
    if (!registration || registration.status !== "active") throw new HttpError(404, "Active registration not found");
    await prisma.registration.update({ where: { id: registration.id }, data: { status: "cancelled", cancelledAt: new Date().toISOString() } });
    await prisma.event.updateMany({ where: { slug: registration.eventSlug, reservedCount: { gt: 0 }, rsvpCount: { gt: 0 } }, data: { reservedCount: { decrement: 1 }, rsvpCount: { decrement: 1 } } });
    const cached = cachedEvents.find((event) => event.slug === registration.eventSlug);
    if (cached) cached.rsvpCount = Math.max(0, cached.rsvpCount - 1);
    response.json({ success: true, dashboard: await participantModel(user, request) });
  }));
  app.get("/api/portal/participant/tickets/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const slug = String(request.params.slug);
    const registration = await prisma.registration.findUnique({ where: { userId_eventSlug: { userId: user.id, eventSlug: slug } } });
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!registration || registration.status !== "active" || !event) throw new HttpError(404, "Ticket not found");
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
    const city = await prisma.city.findUnique({ where: { slug: input.citySlug } });
    if (!city) throw new HttpError(422, "Unknown city");
    const slugs = new Set((await prisma.event.findMany({ select: { slug: true } })).map(({ slug }) => slug));
    const media = { coverImage: input.coverImage ?? "", heroImage: input.heroImage ?? "", thumbnail: input.thumbnail ?? "", gallery: input.gallery ?? [] };
    const created = await prisma.event.create({ data: { title: input.title, slug: uniqueSlug(input.title, slugs), summary: input.summary, category: input.category, type: input.type, mode: input.mode, status: input.status, startsAt: input.startsAt, venue: input.venue, citySlug: city.slug, country: city.country, organizerSlug: organizer.slug, media, attendeeCount: 0, rsvpCount: 0, ticketSalesCount: 0, badges: ["recently-added"], priceLabel: input.priceLabel, capacity: input.capacity, reservedCount: 0 } });
    const event = domainEvent(created);
    addEventToStore(event);
    response.status(201).json({ event, dashboard: await organizerModel(user) });
  }));
  app.put("/api/portal/organizer/events/:slug", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (request, response) => {
    const input = eventUpdateSchema.parse(request.body);
    const existing = response.locals.event as DbEvent;
    const status = input.status ?? existing.status as EventStatus;
    const transitions: Record<string, string[]> = { draft: ["draft", "published", "cancelled"], published: ["published", "sold-out", "cancelled", "completed"], "sold-out": ["sold-out", "published", "cancelled", "completed"], cancelled: ["cancelled"], completed: ["completed"] };
    if (!transitions[existing.status]?.includes(status)) throw new HttpError(409, "Invalid event status transition");
    const city = input.citySlug ? await prisma.city.findUnique({ where: { slug: input.citySlug } }) : null;
    if (input.citySlug && !city) throw new HttpError(422, "Unknown city");
    const currentMedia = existing.media as Event["media"];
    if (input.capacity !== undefined && input.capacity !== null && input.capacity < existing.reservedCount) throw new HttpError(409, "Capacity cannot be lower than active registrations");
    const updated = await prisma.event.update({ where: { id: existing.id }, data: {
      title: input.title, citySlug: input.citySlug, category: input.category, type: input.type, mode: input.mode,
      status, startsAt: input.startsAt, venue: input.venue, summary: input.summary, priceLabel: input.priceLabel,
      capacity: input.capacity, country: city?.country ?? existing.country,
      media: { ...currentMedia, coverImage: input.coverImage ?? currentMedia.coverImage, heroImage: input.heroImage ?? currentMedia.heroImage, thumbnail: input.thumbnail ?? currentMedia.thumbnail, gallery: input.gallery ?? currentMedia.gallery ?? [] }
    } });
    const event = domainEvent(updated);
    const cached = cachedEvents.find((item) => item.slug === event.slug);
    if (cached) Object.assign(cached, event); else addEventToStore(event);
    updateEventVisibility(event);
    response.json({ event, dashboard: await organizerModel(response.locals.user as User) });
  }));
  app.delete("/api/portal/organizer/events/:slug", requireOrganizer, requireOrganizationPermission, requireEventOwnership, asyncHandler(async (_request, response) => {
    const event = response.locals.event as DbEvent;
    const registrationCount = await prisma.registration.count({ where: { eventSlug: event.slug, status: "active" } });
    if (registrationCount > 0) throw new HttpError(409, "Events with active registrations cannot be deleted; cancel the event instead");
    await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), status: "cancelled" } });
    removeEventFromStore(event.slug);
    response.json({ event: domainEvent(event), dashboard: await organizerModel(response.locals.user as User) });
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
    response.json({ users: users.map(safeUser), organizers, events: events.map(domainEvent), registrations, reports, analytics: { users: counts[0], organizers: counts[1], events: counts[2], registrations: counts[3], revenue: null }, pagination: { page, limit: take } });
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
