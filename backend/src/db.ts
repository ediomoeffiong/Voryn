import { Prisma, PrismaClient } from "@prisma/client";
import { cities, organizers, events, syncPublicEvents } from "./data.js";
import type { City, Event, Organizer } from "./domain.js";

export const prisma = new PrismaClient();
let ready = false;

export function isDatabaseReady() {
  return ready;
}

// Legacy records may contain explicit null timestamps. Prisma's @default(now())
// only applies to new writes, so these must be repaired before typed reads.
async function repairLegacyTimestamps() {
  // Raw MongoDB commands use Extended JSON, not JavaScript Date instances.
  const now = { $date: new Date().toISOString() };
  for (const collection of ["Event", "Organizer", "User", "TicketType", "EventLifecycleLog", "MediaAsset", "Session", "PasswordResetToken"] as const) {
    const result = await prisma.$runCommandRaw({
      update: collection,
      updates: [
        { q: { createdAt: null, updatedAt: { $type: "date" } }, u: [{ $set: { createdAt: "$updatedAt" } }], multi: true },
        { q: { createdAt: null }, u: { $set: { createdAt: now } }, multi: true },
        ...(["Event", "Organizer", "User", "TicketType"].includes(collection)
          ? [{ q: { updatedAt: null }, u: { $set: { updatedAt: now } }, multi: true }]
          : [])
      ]
    }) as { nModified?: number; writeErrors?: unknown[] };
    if (result.writeErrors?.length) throw new Error(`Legacy ${collection} timestamp repair failed`);
    if (result.nModified) console.info(`Repaired ${result.nModified} legacy ${collection} timestamp records`);
  }
}

async function repairLegacyRequiredDefaults() {
  const defaults = [
    { collection: "Event", values: { reservedCount: 0, tags: [], visibility: "public", previousSlugs: [], version: 1 } },
    { collection: "Registration", values: { status: "active", quantity: 1, approvalStatus: "approved", paymentStatus: "not_required" } },
    { collection: "User", values: { lastDashboard: "participant", passwordResetRequired: false } },
    { collection: "TicketType", values: { reservedCount: 0, minPerOrder: 1, maxPerOrder: 1, visibility: "public", availability: "available", sortOrder: 0 } }
  ] as const;
  for (const { collection, values } of defaults) {
    const updates = Object.entries(values).map(([field, value]) => ({ q: { [field]: null }, u: { $set: { [field]: value } }, multi: true }));
    const result = await prisma.$runCommandRaw({ update: collection, updates }) as { nModified?: number; writeErrors?: unknown[] };
    if (result.writeErrors?.length) throw new Error(`Legacy ${collection} default repair failed`);
    if (result.nModified) console.info(`Repaired ${result.nModified} legacy ${collection} default fields`);
  }
}

function hydrate(dbCities: Awaited<ReturnType<typeof prisma.city.findMany>>, dbOrganizers: Awaited<ReturnType<typeof prisma.organizer.findMany>>, dbEvents: Awaited<ReturnType<typeof prisma.event.findMany>>) {
  cities.splice(0, cities.length, ...dbCities.map((city) => ({ ...city, coordinates: city.coordinates as City["coordinates"] })));
  organizers.splice(0, organizers.length, ...dbOrganizers.map((organizer) => ({ ...organizer, socials: organizer.socials as Organizer["socials"] })));
  events.splice(0, events.length, ...dbEvents.filter((event) => !event.deletedAt).map((event) => ({
    id: event.id, title: event.title, slug: event.slug, summary: event.summary,
    category: event.category as Event["category"], type: event.type as Event["type"], mode: event.mode as Event["mode"],
    status: event.status as Event["status"], startsAt: event.startsAt, venue: event.venue, citySlug: event.citySlug,
    country: event.country, organizerSlug: event.organizerSlug, media: event.media as Event["media"],
    attendeeCount: event.attendeeCount, rsvpCount: event.rsvpCount, ticketSalesCount: event.ticketSalesCount,
    badges: event.badges as Event["badges"], priceLabel: event.priceLabel, visibility: event.visibility as Event["visibility"], attendanceFormat: event.attendanceFormat as Event["attendanceFormat"],
    endsAt: event.endsAt?.toISOString() ?? null, timezone: event.timezone ?? "UTC", tags: event.tags, descriptionHtml: event.descriptionHtml ?? "", shortSummary: event.shortSummary ?? event.summary, version: event.version
  })));
  syncPublicEvents();
}

async function seedDevelopmentFixtures() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEMO_SEED !== "true") return;
  const [cityCount, organizerCount, eventCount] = await Promise.all([prisma.city.count(), prisma.organizer.count(), prisma.event.count()]);
  if (cityCount === 0) for (const { id: _id, ...city } of cities) await prisma.city.create({ data: city });
  if (organizerCount === 0) for (const { id: _id, ...organizer } of organizers) await prisma.organizer.create({ data: organizer });
  if (eventCount === 0) for (const { id: _id, ...event } of events) await prisma.event.create({ data: { ...event, reservedCount: 0 } as Prisma.EventCreateInput });
}

export async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await prisma.$connect();
  await prisma.$runCommandRaw({ ping: 1 });
  await repairLegacyTimestamps();
  await repairLegacyRequiredDefaults();
  await seedDevelopmentFixtures();
  const [dbCities, dbOrganizers, dbEvents] = await Promise.all([prisma.city.findMany(), prisma.organizer.findMany(), prisma.event.findMany()]);
  hydrate(dbCities, dbOrganizers, dbEvents);
  ready = true;
}

export async function disconnectDb() {
  ready = false;
  await prisma.$disconnect();
}
