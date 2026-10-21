import { PrismaClient } from "@prisma/client";
import { cities, organizers, events, syncPublicEvents } from "./data.js";
import type { City, Event, Organizer } from "./domain.js";

export const prisma = new PrismaClient();
let ready = false;

export function isDatabaseReady() {
  return ready;
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
    badges: event.badges as Event["badges"], priceLabel: event.priceLabel
  })));
  syncPublicEvents();
}

async function seedDevelopmentFixtures() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEMO_SEED !== "true") return;
  const [cityCount, organizerCount, eventCount] = await Promise.all([prisma.city.count(), prisma.organizer.count(), prisma.event.count()]);
  if (cityCount === 0) for (const { id: _id, ...city } of cities) await prisma.city.create({ data: city });
  if (organizerCount === 0) for (const { id: _id, ...organizer } of organizers) await prisma.organizer.create({ data: organizer });
  if (eventCount === 0) for (const { id: _id, ...event } of events) await prisma.event.create({ data: { ...event, reservedCount: 0 } });
}

export async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await prisma.$connect();
  await prisma.$runCommandRaw({ ping: 1 });
  await seedDevelopmentFixtures();
  const [dbCities, dbOrganizers, dbEvents] = await Promise.all([prisma.city.findMany(), prisma.organizer.findMany(), prisma.event.findMany()]);
  hydrate(dbCities, dbOrganizers, dbEvents);
  ready = true;
}

export async function disconnectDb() {
  ready = false;
  await prisma.$disconnect();
}
