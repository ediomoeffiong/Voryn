import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";

type Document = Record<string, unknown>;
const collections = ["Event", "Registration", "TicketType", "EventLifecycleLog", "MediaAsset"];
async function documents(collection: string) { const result = await prisma.$runCommandRaw({ find: collection, filter: {}, batchSize: 100000 }) as unknown as { cursor?: { firstBatch?: Document[] } }; return result.cursor?.firstBatch ?? []; }
function idText(value: unknown) { if (typeof value === "string") return value; if (value && typeof value === "object" && "$oid" in value) return String((value as { $oid: unknown }).$oid); return String(value ?? ""); }
function dateFrom(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? null : date; }

async function main() {
  const apply = process.argv.includes("--apply"); const backupRoot = resolve(process.env.STAGE2_BACKUP_DIR ?? "backups", `stage2-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await prisma.$connect(); const data = new Map<string, Document[]>(); for (const name of collections) { try { data.set(name, await documents(name)); } catch { data.set(name, []); } }
  const events = data.get("Event") ?? []; const registrations = data.get("Registration") ?? []; const slugs = new Map(events.map((event) => [String(event.slug), event]));
  const brokenRegistrations = registrations.filter((registration) => !slugs.has(String(registration.eventSlug))).length;
  const invalidDates = events.filter((event) => !dateFrom(event.startsAt)).map((event) => String(event.slug));
  const ambiguousPrices = events.filter((event) => !/^free$/i.test(String(event.priceLabel ?? "")) && String(event.priceLabel ?? "").trim()).map((event) => ({ slug: String(event.slug), priceLabel: String(event.priceLabel) }));
  const report = { mode: apply ? "apply" : "dry-run", counts: Object.fromEntries([...data].map(([name, rows]) => [name, rows.length])), eventsMissingVersion: events.filter((event) => event.version == null).length, eventsWithNullTimestamps: events.filter((event) => event.createdAt == null || event.updatedAt == null).length, legacySoldOutStatuses: events.filter((event) => event.status === "sold-out").length, invalidDates, brokenRegistrations, ambiguousPrices, conflictsRequireReview: invalidDates.length + brokenRegistrations };
  console.log(JSON.stringify(report, null, 2)); if (!apply) return; if (report.conflictsRequireReview) throw new Error("Invalid dates or broken registrations require review; no records were changed");
  await mkdir(backupRoot, { recursive: true }); for (const [name, rows] of data) await writeFile(resolve(backupRoot, `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
  const now = new Date();
  for (const event of events) {
    const starts = dateFrom(event.startsAt)!; const ends = dateFrom(event.endsAt) ?? new Date(starts.getTime() + 7200000); const free = /^free$/i.test(String(event.priceLabel ?? "")); const online = event.mode === "online"; const status = event.status === "sold-out" ? "published" : String(event.status ?? "draft");
    const defaults = { descriptionHtml: "", shortSummary: String(event.summary ?? ""), tags: [], language: "en", targetAudience: "", visibility: "public", attendanceFormat: online ? "online" : "physical", endsAt: ends, timezone: "UTC", schedule: [], recurrence: null, location: { format: online ? "online" : "physical", venueName: String(event.venue ?? ""), address: "", city: String(event.citySlug ?? ""), region: "", country: String(event.country ?? ""), countryCode: "", postalCode: "", directions: "", accessibility: "", meetingPlatform: online ? "Legacy online event" : "", meetingUrl: "", joiningInstructions: "", accessRestriction: "", revealAfterRegistration: true }, registration: { mode: free ? "free" : "disabled", accountRequired: true, approvalRequired: false, waitlistEnabled: false, confirmationMessage: "", questions: [], migrationReviewRequired: !free }, faqs: [], speakers: [], advancedSettings: {}, previousSlugs: [], attendeeCount: 0, rsvpCount: 0, ticketSalesCount: 0, reservedCount: 0, badges: [], media: { coverImage: "", heroImage: "", thumbnail: "", gallery: [] }, priceLabel: free ? "Free" : String(event.priceLabel ?? "Not configured"), version: 1, status, createdAt: event.createdAt ?? now, updatedAt: event.updatedAt ?? now };
    await prisma.$runCommandRaw({ update: "Event", updates: [{ q: { _id: event._id }, u: { $set: Object.fromEntries(Object.entries(defaults).filter(([key]) => event[key] == null || key === "status")) }, multi: false }] } as Prisma.InputJsonObject);
    if (free && !(data.get("TicketType") ?? []).some((ticket) => idText(ticket.eventId) === idText(event._id))) await prisma.ticketType.create({ data: { eventId: idText(event._id), name: "Free entry", description: "Migrated from the legacy free registration setting", currency: "NGN", priceMinor: 0, capacity: typeof event.capacity === "number" ? event.capacity : null, reservedCount: Number(event.reservedCount ?? 0), minPerOrder: 1, maxPerOrder: 1, visibility: "public", availability: "available", sortOrder: 0 } });
  }
  for (const registration of registrations) { const event = slugs.get(String(registration.eventSlug))!; await prisma.$runCommandRaw({ update: "Registration", updates: [{ q: { _id: registration._id }, u: { $set: { eventId: event._id, quantity: registration.quantity ?? 1, answers: registration.answers ?? null, approvalStatus: registration.approvalStatus ?? "approved", paymentStatus: registration.paymentStatus ?? "not_required" } }, multi: false }] } as Prisma.InputJsonObject); }
  console.log(`Stage 2 migration applied. Backup: ${backupRoot}. ${ambiguousPrices.length} legacy price labels remain disabled and flagged for organizer review.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

