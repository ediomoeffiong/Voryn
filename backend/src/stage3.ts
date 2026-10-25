import type { Express, Request } from "express";
import { Prisma, type Event as DbEvent, type Registration, type User } from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireAuth, requireOrganizationPermission, requireOrganizer, requireParticipantAccess, safeUser } from "./auth.js";
import { writeAudit } from "./audit.js";
import { prisma, isDatabaseReady } from "./db.js";
import { publicEvent } from "./events.js";
import { asyncHandler, HttpError } from "./http.js";
import { hashToken } from "./security.js";
import { paymentService } from "./payments/service.js";
import { defaultPaymentProvider } from "./payments/paystack.js";
import { emailService } from "./notifications/email.js";
import { getWorkerStatus } from "./worker.js";

const pageSchema = z.coerce.number().int().min(1).max(100000).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
const decisionSchema = z.object({ decision: z.enum(["approved", "rejected", "waitlisted", "cancelled"]), reason: z.string().trim().max(500).optional() }).strict();
const checkInSchema = z.object({ code: z.string().trim().min(8).max(160), eventSlug: z.string().trim().min(1).max(180) }).strict();
const reverseSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const announcementSchema = z.object({
  eventSlug: z.string().min(1), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000),
  audience: z.enum(["confirmed", "pending", "checked_in", "not_checked_in", "ticket_type"]).default("confirmed"),
  action: z.enum(["draft", "send", "schedule"]).default("draft"), scheduledAt: z.string().datetime().optional()
}).strict();
const profilePreferencesSchema = z.object({ interests: z.array(z.string().trim().min(1).max(80)).max(30).optional(), locationPreferences: z.record(z.string(), z.unknown()).optional() }).strict();
const reportSchema = z.object({ resourceType: z.enum(["event", "organizer"]), resourceId: z.string().min(1).max(180), category: z.string().trim().min(2).max(80), description: z.string().trim().min(10).max(3000), evidence: z.array(z.string().url()).max(5).optional() }).strict();
const userActionSchema = z.object({ action: z.enum(["suspend", "reactivate", "role", "revoke_sessions"]), role: z.enum(["participant", "organizer", "admin"]).optional(), reason: z.string().trim().max(500).optional() }).strict();
const moderationSchema = z.object({ status: z.enum(["open", "under_review", "resolved", "dismissed", "escalated"]), resolution: z.string().trim().max(2000).optional() }).strict();
const verificationSchema = z.object({ status: z.enum(["pending", "verified", "rejected", "suspended"]), notes: z.string().trim().max(2000).optional() }).strict();
const settingSchema = z.object({ value: z.unknown(), description: z.string().trim().max(500).optional() }).strict();

function pagination(request: Request) {
  const page = pageSchema.parse(request.query.page);
  const limit = limitSchema.parse(request.query.limit);
  return { page, limit, skip: (page - 1) * limit };
}

function organizerSlug(user: User) {
  if (!user.organizerSlug) throw new HttpError(403, "Organizer membership required");
  return user.organizerSlug;
}

function adminUserSummary(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, lastDashboard: user.lastDashboard, organizerSlug: user.organizerSlug, profileImage: user.profileImage, accountStatus: user.accountStatus, createdAt: user.createdAt, updatedAt: user.updatedAt, lastActiveAt: user.lastActiveAt };
}

function dateRange(request: Request) {
  const to = typeof request.query.to === "string" ? new Date(request.query.to) : new Date();
  const from = typeof request.query.from === "string" ? new Date(request.query.from) : new Date(to.getTime() - 30 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new HttpError(422, "Invalid date range");
  return { from, to };
}

export function registrationStatus(registration: Pick<Registration, "status" | "approvalStatus">) {
  if (registration.status === "cancelled") return "cancelled";
  if (registration.approvalStatus === "pending") return "pending";
  if (registration.approvalStatus === "rejected") return "rejected";
  if (registration.approvalStatus === "waitlisted") return "waitlisted";
  return "confirmed";
}

async function ownedEvents(user: User) {
  return prisma.event.findMany({ where: { organizerSlug: organizerSlug(user), deletedAt: null } });
}

async function ensureOwnedRegistration(user: User, registrationId: string) {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration) throw new HttpError(404, "Registration not found");
  const event = await prisma.event.findFirst({ where: { slug: registration.eventSlug, organizerSlug: organizerSlug(user), deletedAt: null } });
  if (!event) throw new HttpError(403, "Registration does not belong to your organization");
  return { registration, event };
}

async function ensureTicket(registration: Registration, event: DbEvent) {
  if (registration.status !== "active" || registration.approvalStatus !== "approved") return null;
  if (registration.paymentStatus !== "not_required" && registration.paymentStatus !== "verified") return null;
  return prisma.ticket.upsert({
    where: { registrationId: registration.id },
    update: {},
    create: { registrationId: registration.id, eventId: event.id, ticketTypeId: registration.ticketTypeId, codeHash: hashToken(registration.ticketCode), displayCode: registration.ticketCode }
  });
}

async function attendeeRows(user: User, request: Request, exportAll = false) {
  const { page, limit, skip } = pagination(request);
  const events = await ownedEvents(user);
  const filteredEvents = typeof request.query.event === "string" ? events.filter((event) => event.slug === request.query.event) : events;
  const eventSlugs = filteredEvents.map((event) => event.slug);
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const matchingUsers = query ? await prisma.user.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }, select: { id: true } }) : [];
  const where: Prisma.RegistrationWhereInput = { eventSlug: { in: eventSlugs }, ...(query ? { userId: { in: matchingUsers.map((item) => item.id) } } : {}), ...(status === "cancelled" ? { status: "cancelled" } : status === "pending" || status === "rejected" || status === "waitlisted" ? { approvalStatus: status } : status === "confirmed" ? { status: "active", approvalStatus: "approved" } : {}) };
  const registrations = await prisma.registration.findMany({ where, orderBy: { updatedAt: "desc" }, ...(exportAll ? {} : { skip, take: limit }) });
  const users = await prisma.user.findMany({ where: { id: { in: registrations.map((item) => item.userId) } } });
  const userMap = new Map(users.map((item) => [item.id, item]));
  const visible = registrations.filter((item) => userMap.has(item.userId));
  const tickets = await prisma.ticket.findMany({ where: { registrationId: { in: visible.map((item) => item.id) } } });
  const ticketMap = new Map(tickets.map((item) => [item.registrationId, item]));
  const ticketTypes = await prisma.ticketType.findMany({ where: { id: { in: visible.flatMap((item) => item.ticketTypeId ? [item.ticketTypeId] : []) } } });
  const ticketTypeMap = new Map(ticketTypes.map((item) => [item.id, item]));
  const rows = visible.map((item) => ({ ...item, registrationStatus: registrationStatus(item), user: safeUser(userMap.get(item.userId)!), ticket: ticketMap.get(item.id) ?? null, ticketType: item.ticketTypeId ? ticketTypeMap.get(item.ticketTypeId)?.name ?? null : null }));
  return { rows, events: filteredEvents.map((event) => publicEvent(event, [], true)), pagination: { page, limit, total: await prisma.registration.count({ where }) } };
}

export function csvCell(value: unknown) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function registerStage3Routes(app: Express) {
  app.get("/api/stage3/organizer/overview", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const { from, to } = dateRange(request);
    const events = await ownedEvents(user);
    const slugs = events.map((event) => event.slug);
    const registrations = await prisma.registration.findMany({ where: { eventSlug: { in: slugs } } });
    const checkIns = await prisma.checkIn.findMany({ where: { eventId: { in: events.map((event) => event.id) }, action: "check_in", occurredAt: { gte: from, lte: to } }, orderBy: { occurredAt: "desc" }, take: 200 });
    const confirmed = registrations.filter((item) => item.status === "active" && item.approvalStatus === "approved");
    const checkedInIds = new Set(registrations.filter((item) => item.checkedIn).map((item) => item.id));
    const now = Date.now();
    const revenue = await paymentService.getOrganizerRevenueMetrics(organizerSlug(user));
    response.json({
      range: { from, to },
      metrics: {
        totalEvents: events.length, upcomingEvents: events.filter((item) => new Date(item.startsAt).getTime() >= now && !["cancelled", "archived", "trashed"].includes(item.status)).length,
        publishedEvents: events.filter((item) => item.status === "published").length, draftEvents: events.filter((item) => item.status === "draft").length, cancelledEvents: events.filter((item) => item.status === "cancelled").length,
        totalRegistrations: registrations.length, confirmedAttendees: confirmed.reduce((sum, item) => sum + item.quantity, 0), checkedInAttendees: confirmed.filter((item) => checkedInIds.has(item.id)).reduce((sum, item) => sum + item.quantity, 0),
        ticketsIssued: await prisma.ticket.count({ where: { eventId: { in: events.map((item) => item.id) }, status: "valid" } }), availableCapacity: events.reduce((sum, item) => sum + Math.max(0, (item.capacity ?? item.reservedCount) - item.reservedCount), 0), grossRevenue: revenue.grossMinor
      },
      upcoming: events.filter((item) => new Date(item.startsAt).getTime() >= now).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).slice(0, 5).map((event) => publicEvent(event, [], true)),
      recentActivity: checkIns.slice(0, 10)
    });
  }));

  app.get("/api/stage3/organizer/attendees", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => response.json(await attendeeRows(response.locals.user as User, request))));
  app.get("/api/stage3/organizer/attendees/export", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const { rows } = await attendeeRows(response.locals.user as User, request, true);
    const header = ["Name", "Email", "Event", "Registered at", "Ticket type", "Registration status", "Check-in status", "Reference"];
    const csv = [header, ...rows.map((row) => [row.user.name, row.user.email, row.eventSlug, row.registeredAt, row.ticketType ?? "General admission", row.registrationStatus, row.checkedIn ? "Checked in" : "Not checked in", row.ticketCode])].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    response.type("text/csv").attachment(`voryn-registrations-${stamp}.csv`).send(`\uFEFF${csv}`);
  }));
  app.get("/api/stage3/organizer/registrations/:id", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const { registration, event } = await ensureOwnedRegistration(response.locals.user as User, String(request.params.id));
    const [attendee, ticket, history, notifications] = await Promise.all([
      prisma.user.findUnique({ where: { id: registration.userId } }), prisma.ticket.findUnique({ where: { registrationId: registration.id } }),
      prisma.checkIn.findMany({ where: { registrationId: registration.id }, orderBy: { occurredAt: "desc" } }), prisma.notification.findMany({ where: { userId: registration.userId, eventSlug: event.slug }, orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    if (!attendee) throw new HttpError(404, "Attendee not found");
    response.json({ registration: { ...registration, registrationStatus: registrationStatus(registration) }, attendee: safeUser(attendee), event: publicEvent(event, [], true), ticket, checkInHistory: history, communicationHistory: notifications });
  }));
  app.post("/api/stage3/organizer/registrations/:id/status", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = decisionSchema.parse(request.body);
    const { registration, event } = await ensureOwnedRegistration(user, String(request.params.id));
    if (input.decision === "approved" && event.capacity !== null && event.reservedCount > event.capacity) throw new HttpError(409, "Event capacity has been reached");
    const updated = await prisma.registration.update({ where: { id: registration.id }, data: { approvalStatus: input.decision === "cancelled" ? registration.approvalStatus : input.decision, status: input.decision === "cancelled" ? "cancelled" : "active", statusReason: input.reason } });
    const ticket = input.decision === "approved" ? await ensureTicket(updated, event) : null;
    if (["rejected", "cancelled"].includes(input.decision) && registration.status === "active") {
      await prisma.event.updateMany({ where: { id: event.id, reservedCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity } } });
      if (registration.ticketTypeId) await prisma.ticketType.updateMany({ where: { id: registration.ticketTypeId, reservedCount: { gte: registration.quantity } }, data: { reservedCount: { decrement: registration.quantity } } });
      await prisma.ticket.updateMany({ where: { registrationId: registration.id, status: "valid" }, data: { status: "cancelled", invalidatedAt: new Date() } });
    }
    await prisma.notification.create({ data: { userId: registration.userId, category: "registration", title: `Registration ${input.decision}`, message: input.reason || `Your registration for ${event.title} is now ${input.decision}.`, eventSlug: event.slug } });
    await writeAudit(request, user, `registration.${input.decision}`, "registration", registration.id, { reason: input.reason, eventId: event.id });
    response.json({ registration: updated, ticket });
  }));

  app.post("/api/stage3/organizer/check-ins", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = checkInSchema.parse(request.body);
    const event = await prisma.event.findFirst({ where: { slug: input.eventSlug, organizerSlug: organizerSlug(user), deletedAt: null } });
    if (!event) throw new HttpError(403, "Event is not available for check-in");
    let ticket = await prisma.ticket.findUnique({ where: { codeHash: hashToken(input.code) } });
    if (!ticket) {
      const legacy = await prisma.registration.findFirst({ where: { ticketCode: input.code, eventSlug: event.slug } });
      if (legacy) ticket = await ensureTicket(legacy, event);
    }
    if (!ticket) throw new HttpError(404, "Invalid ticket");
    if (ticket.eventId !== event.id) throw new HttpError(409, "Ticket belongs to a different event");
    if (ticket.status !== "valid") throw new HttpError(409, `Ticket is ${ticket.status}`);
    const registration = await prisma.registration.findUnique({ where: { id: ticket.registrationId } });
    if (!registration || registration.status !== "active" || registration.approvalStatus !== "approved" || !["not_required", "verified"].includes(registration.paymentStatus)) throw new HttpError(409, "Ticket is not eligible for entry");
    const claim = await prisma.registration.updateMany({ where: { id: registration.id, checkedIn: false, status: "active", approvalStatus: "approved" }, data: { checkedIn: true } });
    if (claim.count !== 1) throw new HttpError(409, "Ticket has already been checked in");
    const checkIn = await prisma.checkIn.create({ data: { registrationId: registration.id, ticketId: ticket.id, eventId: event.id, actorId: user.id, action: "check_in" } });
    await writeAudit(request, user, "check_in.created", "registration", registration.id, { eventId: event.id, checkInId: checkIn.id });
    response.status(201).json({ result: "checked_in", checkIn, registration: { ...registration, checkedIn: true } });
  }));
  app.post("/api/stage3/organizer/registrations/:id/reverse-check-in", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const { reason } = reverseSchema.parse(request.body);
    const { registration, event } = await ensureOwnedRegistration(user, String(request.params.id));
    const ticket = await prisma.ticket.findUnique({ where: { registrationId: registration.id } });
    if (!ticket || !registration.checkedIn) throw new HttpError(409, "Registration is not checked in");
    const claim = await prisma.registration.updateMany({ where: { id: registration.id, checkedIn: true }, data: { checkedIn: false } });
    if (claim.count !== 1) throw new HttpError(409, "Check-in state changed; refresh and try again");
    const correction = await prisma.checkIn.create({ data: { registrationId: registration.id, ticketId: ticket.id, eventId: event.id, actorId: user.id, action: "reverse", reason } });
    await writeAudit(request, user, "check_in.reversed", "registration", registration.id, { eventId: event.id, reason, correctionId: correction.id });
    response.json({ result: "reversed", correction });
  }));
  app.get("/api/stage3/organizer/check-ins/analytics", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const eventSlug = typeof request.query.event === "string" ? request.query.event : undefined;
    const events = (await ownedEvents(user)).filter((event) => !eventSlug || event.slug === eventSlug);
    const registrations = await prisma.registration.findMany({ where: { eventSlug: { in: events.map((item) => item.slug) }, status: "active", approvalStatus: "approved" } });
    const checkedIn = registrations.filter((item) => item.checkedIn).reduce((sum, item) => sum + item.quantity, 0);
    const confirmed = registrations.reduce((sum, item) => sum + item.quantity, 0);
    const activity = await prisma.checkIn.findMany({ where: { eventId: { in: events.map((item) => item.id) }, action: "check_in" }, orderBy: { occurredAt: "asc" }, take: 1000 });
    response.json({ confirmed, checkedIn, notCheckedIn: confirmed - checkedIn, rate: confirmed ? checkedIn / confirmed : 0, activity });
  }));

  app.get("/api/stage3/organizer/analytics", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const events = await ownedEvents(response.locals.user as User);
    const selected = typeof request.query.event === "string" ? events.filter((event) => event.slug === request.query.event) : events;
    const registrations = await prisma.registration.findMany({ where: { eventSlug: { in: selected.map((item) => item.slug) } }, orderBy: { registeredAt: "asc" } });
    const revMetrics = await paymentService.getOrganizerRevenueMetrics(organizerSlug(response.locals.user as User));
    const byEvent = selected.map((event) => {
      const rows = registrations.filter((item) => item.eventSlug === event.slug);
      const confirmed = rows.filter((item) => item.status === "active" && item.approvalStatus === "approved");
      const checkedIn = confirmed.filter((item) => item.checkedIn);
      const evRev = revMetrics.byEvent.find((e) => e.eventId === event.id);
      return {
        eventSlug: event.slug,
        title: event.title,
        registrations: rows.length,
        confirmed: confirmed.length,
        cancelled: rows.filter((item) => item.status === "cancelled").length,
        waitlisted: rows.filter((item) => item.approvalStatus === "waitlisted").length,
        checkedIn: checkedIn.length,
        checkInRate: confirmed.length ? checkedIn.length / confirmed.length : 0,
        remainingCapacity: event.capacity === null ? null : Math.max(0, event.capacity - event.reservedCount),
        conversionRate: null,
        revenue: evRev ? evRev.netMinor : 0
      };
    });
    const trend = Object.entries(registrations.reduce<Record<string, number>>((acc, item) => { const day = item.registeredAt.slice(0, 10); acc[day] = (acc[day] ?? 0) + 1; return acc; }, {})).map(([date, count]) => ({ date, count }));
    response.json({
      byEvent,
      trend,
      revenue: {
        configured: revMetrics.configured,
        currencies: revMetrics.currencies,
        gross: revMetrics.grossMinor,
        refunds: revMetrics.refundedMinor,
        net: revMetrics.netMinor
      }
    });
  }));

  app.get("/api/stage3/organizer/announcements", requireOrganizer, requireOrganizationPermission, asyncHandler(async (_request, response) => {
    const user = response.locals.user as User;
    response.json(await prisma.announcement.findMany({ where: { organizerSlug: organizerSlug(user) }, orderBy: { createdAt: "desc" } }));
  }));
  app.post("/api/stage3/organizer/announcements", requireOrganizer, requireOrganizationPermission, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = announcementSchema.parse(request.body);
    const event = await prisma.event.findFirst({ where: { slug: input.eventSlug, organizerSlug: organizerSlug(user), deletedAt: null } });
    if (!event) throw new HttpError(403, "Event does not belong to this organizer");
    const where: Prisma.RegistrationWhereInput = { eventSlug: event.slug, status: "active", ...(input.audience === "pending" ? { approvalStatus: "pending" } : input.audience === "checked_in" ? { approvalStatus: "approved", checkedIn: true } : input.audience === "not_checked_in" ? { approvalStatus: "approved", checkedIn: false } : { approvalStatus: "approved" }) };
    const recipientCount = await prisma.registration.count({ where });
    const provider = process.env.EMAIL_WEBHOOK_URL ? "webhook" : null;
    const status = input.action === "draft" ? "draft" : input.action === "schedule" ? "scheduled" : provider ? "queued" : "delivery_unavailable";
    const announcement = await prisma.announcement.create({ data: { eventSlug: event.slug, organizerSlug: organizerSlug(user), subject: input.subject, message: input.message, audience: input.audience, status, recipientCount, deliveryProvider: provider, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null, createdById: user.id, sentAt: null } });
    await writeAudit(request, user, "announcement.created", "announcement", announcement.id, { eventId: event.id, status, recipientCount });
    response.status(201).json({ announcement, deliveryAvailable: Boolean(provider) });
  }));

  app.get("/api/stage3/participant/tickets", requireParticipantAccess, asyncHandler(async (_request, response) => {
    const user = response.locals.user as User;
    const registrations = await prisma.registration.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
    const events = await prisma.event.findMany({ where: { slug: { in: registrations.map((item) => item.eventSlug) }, deletedAt: null } });
    const eventMap = new Map(events.map((item) => [item.slug, item]));
    const wallet = await Promise.all(registrations.map(async (registration) => { const event = eventMap.get(registration.eventSlug); if (!event) return null; const ticket = await ensureTicket(registration, event); return { registration: { ...registration, registrationStatus: registrationStatus(registration) }, event: publicEvent(event, [], true), ticket }; }));
    response.json(wallet.filter(Boolean));
  }));
  app.get("/api/stage3/participant/notifications", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User; const { page, limit, skip } = pagination(request);
    const [items, total, unread] = await Promise.all([prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip, take: limit }), prisma.notification.count({ where: { userId: user.id } }), prisma.notification.count({ where: { userId: user.id, readAt: null } })]);
    response.json({ items, unread, pagination: { page, limit, total } });
  }));
  app.post("/api/stage3/participant/notifications/read", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const input = z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }).strict().parse(request.body);
    await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) }, data: { readAt: new Date() } });
    response.json({ success: true });
  }));
  app.delete("/api/stage3/participant/following/:slug", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User; const slug = String(request.params.slug);
    if (user.following.includes(slug)) { await prisma.user.update({ where: { id: user.id }, data: { following: user.following.filter((item) => item !== slug) } }); await prisma.organizer.updateMany({ where: { slug, followers: { gt: 0 } }, data: { followers: { decrement: 1 } } }); }
    response.status(204).send();
  }));
  app.put("/api/stage3/participant/preferences", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User; const input = profilePreferencesSchema.parse(request.body);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { interests: input.interests, locationPreferences: input.locationPreferences as Prisma.InputJsonValue | undefined } }); response.json({ user: safeUser(updated) });
  }));
  app.post("/api/stage3/reports", requireAuth, asyncHandler(async (request, response) => {
    const user = response.locals.user as User; const input = reportSchema.parse(request.body);
    const recent = await prisma.moderationReport.count({ where: { reporterId: user.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (recent >= 5) throw new HttpError(429, "Report limit reached; try again later");
    const report = await prisma.moderationReport.create({ data: { ...input, evidence: input.evidence ?? [], reporterId: user.id } }); response.status(201).json({ report });
  }));

  app.get("/api/stage3/admin/overview", requireAdmin, asyncHandler(async (_request, response) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const [users, activeUsers, organizers, events, published, drafts, registrations, moderation, reports, audit, adminFin] = await Promise.all([
      prisma.user.count(), prisma.user.count({ where: { lastActiveAt: { gte: since }, accountStatus: "active" } }), prisma.organizer.count(), prisma.event.count({ where: { deletedAt: null } }), prisma.event.count({ where: { status: "published", deletedAt: null } }), prisma.event.count({ where: { status: "draft", deletedAt: null } }), prisma.registration.count(), prisma.moderationReport.count({ where: { status: { in: ["open", "under_review", "escalated"] } } }), prisma.moderationReport.count(), prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
      paymentService.getAdminFinancialOverview()
    ]);
    response.json({ metrics: { users, activeUsers, organizers, events, publishedEvents: published, draftEvents: drafts, registrations, moderationBacklog: moderation, reports, revenue: adminFin.totalNetMinor }, recentActivity: audit, activeUserDefinition: "Active account with authenticated activity in the last 30 days" });
  }));
  app.get("/api/stage3/admin/users", requireAdmin, asyncHandler(async (request, response) => {
    const { page, limit, skip } = pagination(request); const q = typeof request.query.q === "string" ? request.query.q.trim() : ""; const role = typeof request.query.role === "string" ? request.query.role : undefined; const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const where: Prisma.UserWhereInput = { ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}), ...(role ? { role } : {}), ...(status ? { accountStatus: status } : {}) };
    const [items, total] = await Promise.all([prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }), prisma.user.count({ where })]); response.json({ items: items.map(adminUserSummary), pagination: { page, limit, total } });
  }));
  app.post("/api/stage3/admin/users/:id/actions", requireAdmin, asyncHandler(async (request, response) => {
    const actor = response.locals.user as User; const input = userActionSchema.parse(request.body); const target = await prisma.user.findUnique({ where: { id: String(request.params.id) } }); if (!target) throw new HttpError(404, "User not found");
    if ((input.action === "suspend" || (input.action === "role" && input.role !== "admin")) && target.role === "admin" && await prisma.user.count({ where: { role: "admin", accountStatus: "active" } }) <= 1) throw new HttpError(409, "The last active administrator cannot lose access");
    let updated = target;
    if (input.action === "suspend") updated = await prisma.user.update({ where: { id: target.id }, data: { accountStatus: "suspended" } });
    if (input.action === "reactivate") updated = await prisma.user.update({ where: { id: target.id }, data: { accountStatus: "active" } });
    if (input.action === "role") { if (!input.role) throw new HttpError(422, "Role is required"); updated = await prisma.user.update({ where: { id: target.id }, data: { role: input.role, lastDashboard: input.role === "organizer" ? "organizer" : input.role } }); }
    if (input.action === "revoke_sessions" || input.action === "suspend") await prisma.session.deleteMany({ where: { userId: target.id } });
    await writeAudit(request, actor, `user.${input.action}`, "user", target.id, { previousRole: target.role, role: input.role, reason: input.reason }); response.json({ user: adminUserSummary(updated) });
  }));
  app.get("/api/stage3/admin/organizers", requireAdmin, asyncHandler(async (request, response) => { const { page, limit, skip } = pagination(request); const [items, total] = await Promise.all([prisma.organizer.findMany({ skip, take: limit, orderBy: { createdAt: "desc" } }), prisma.organizer.count()]); response.json({ items, pagination: { page, limit, total } }); }));
  app.post("/api/stage3/admin/organizers/:id/verification", requireAdmin, asyncHandler(async (request, response) => {
    const actor = response.locals.user as User; const input = verificationSchema.parse(request.body); const organizer = await prisma.organizer.findUnique({ where: { id: String(request.params.id) } }); if (!organizer) throw new HttpError(404, "Organizer not found");
    const [updated, review] = await prisma.$transaction([prisma.organizer.update({ where: { id: organizer.id }, data: { verificationStatus: input.status, accountStatus: input.status === "suspended" ? "suspended" : organizer.accountStatus } }), prisma.organizerVerification.create({ data: { organizerId: organizer.id, status: input.status, notes: input.notes, reviewedById: actor.id, reviewedAt: new Date() } })]);
    await writeAudit(request, actor, "organizer.verification_changed", "organizer", organizer.id, { before: organizer.verificationStatus, after: input.status, notes: input.notes }); response.json({ organizer: updated, review });
  }));
  app.get("/api/stage3/admin/reports", requireAdmin, asyncHandler(async (request, response) => { const { page, limit, skip } = pagination(request); const status = typeof request.query.status === "string" ? request.query.status : undefined; const where = status ? { status } : {}; const [items, total] = await Promise.all([prisma.moderationReport.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }), prisma.moderationReport.count({ where })]); response.json({ items, pagination: { page, limit, total } }); }));
  app.post("/api/stage3/admin/reports/:id/resolve", requireAdmin, asyncHandler(async (request, response) => {
    const actor = response.locals.user as User; const input = moderationSchema.parse(request.body); const report = await prisma.moderationReport.findUnique({ where: { id: String(request.params.id) } }); if (!report) throw new HttpError(404, "Report not found");
    const final = ["resolved", "dismissed"].includes(input.status); const updated = await prisma.moderationReport.update({ where: { id: report.id }, data: { status: input.status, resolution: input.resolution, assignedToId: actor.id, resolvedById: final ? actor.id : null, resolvedAt: final ? new Date() : null } }); await writeAudit(request, actor, "moderation.status_changed", report.resourceType, report.resourceId, { reportId: report.id, before: report.status, after: input.status, resolution: input.resolution }); response.json({ report: updated });
  }));
  app.get("/api/stage3/admin/audit-logs", requireAdmin, asyncHandler(async (request, response) => { const { page, limit, skip } = pagination(request); const action = typeof request.query.action === "string" ? request.query.action : undefined; const resourceType = typeof request.query.resourceType === "string" ? request.query.resourceType : undefined; const where = { ...(action ? { action: { contains: action } } : {}), ...(resourceType ? { resourceType } : {}) }; const [items, total] = await Promise.all([prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }), prisma.auditLog.count({ where })]); response.json({ items, pagination: { page, limit, total } }); }));
  app.get("/api/stage3/admin/settings", requireAdmin, asyncHandler(async (_request, response) => response.json(await prisma.platformSetting.findMany({ orderBy: { key: "asc" } }))));
  app.put("/api/stage3/admin/settings/:key", requireAdmin, asyncHandler(async (request, response) => { const actor = response.locals.user as User; const input = settingSchema.parse(request.body); const key = String(request.params.key).slice(0, 120); const previous = await prisma.platformSetting.findUnique({ where: { key } }); const setting = await prisma.platformSetting.upsert({ where: { key }, update: { value: input.value as Prisma.InputJsonValue, description: input.description, updatedById: actor.id }, create: { key, value: input.value as Prisma.InputJsonValue, description: input.description, updatedById: actor.id } }); await writeAudit(request, actor, "platform_setting.updated", "platform_setting", setting.id, { key, hadPreviousValue: Boolean(previous) }); response.json({ setting }); }));
  app.get("/api/stage3/admin/system-health", requireAdmin, asyncHandler(async (_request, response) => {
    let database = false;
    try {
      await prisma.$runCommandRaw({ ping: 1 });
      database = true;
    } catch {
      database = false;
    }
    const emailStatus = emailService.getStatus();
    const paystackConfigured = defaultPaymentProvider.isConfigured();
    const workerStatus = getWorkerStatus();

    response.json({
      api: "operational",
      database: database && isDatabaseReady() ? "ready" : "unavailable",
      notifications: emailStatus.configured ? `${emailStatus.provider}_configured` : "not_configured",
      payments: paystackConfigured ? "paystack_configured" : (process.env.NODE_ENV === "test" ? "test_mode" : "not_configured"),
      backgroundJobs: workerStatus.running ? "worker_active" : (process.env.SCHEDULER_SECRET ? "scheduler_endpoint_configured" : "manual"),
      checkedAt: new Date()
    });
  }));
}
