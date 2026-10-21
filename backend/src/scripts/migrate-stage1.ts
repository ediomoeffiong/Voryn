import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../db.js";
import { isPasswordHash, normalizeEmail } from "../security.js";

type Document = Record<string, unknown>;
const collections = ["City", "Organizer", "Event", "User", "Registration", "Announcement", "Review", "Session", "PasswordResetToken"];

async function documents(collection: string) {
  const result = await prisma.$runCommandRaw({ find: collection, filter: {}, batchSize: 100000 }) as unknown as { cursor?: { firstBatch?: Document[] } };
  return result.cursor?.firstBatch ?? [];
}

function idText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "$oid" in value) return String((value as { $oid: unknown }).$oid);
  return String(value ?? "");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupRoot = resolve(process.env.STAGE1_BACKUP_DIR ?? "backups", `stage1-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await prisma.$connect();
  const data = new Map<string, Document[]>();
  for (const collection of collections) {
    try { data.set(collection, await documents(collection)); } catch { data.set(collection, []); }
  }
  const users = data.get("User") ?? [];
  const events = data.get("Event") ?? [];
  const registrations = data.get("Registration") ?? [];
  const normalizedEmails = new Map<string, number>();
  for (const user of users) {
    const email = normalizeEmail(String(user.email ?? ""));
    normalizedEmails.set(email, (normalizedEmails.get(email) ?? 0) + 1);
  }
  const duplicateEmails = [...normalizedEmails.entries()].filter(([, count]) => count > 1).map(([email]) => email);
  const registrationKeys = new Map<string, number>();
  for (const registration of registrations) {
    const key = `${registration.userId}:${registration.eventSlug}`;
    registrationKeys.set(key, (registrationKeys.get(key) ?? 0) + 1);
  }
  const duplicateRegistrations = [...registrationKeys.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
  const userIds = new Set(users.map((user) => idText(user._id)));
  const eventSlugs = new Set(events.map((event) => String(event.slug)));
  const brokenRegistrations = registrations.filter((registration) => !userIds.has(String(registration.userId)) || !eventSlugs.has(String(registration.eventSlug))).length;
  const legacyPasswordUsers = users.filter((user) => !isPasswordHash(String(user.password ?? ""))).length;
  const report = { mode: apply ? "apply" : "dry-run", counts: Object.fromEntries([...data].map(([key, value]) => [key, value.length])), legacyPasswordUsers, duplicateEmails, duplicateRegistrations, brokenRegistrations, conflictsRequireReview: duplicateEmails.length + duplicateRegistrations.length + brokenRegistrations };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) return;
  if (report.conflictsRequireReview) throw new Error("Conflicts require administrative review; no records were changed");
  await mkdir(backupRoot, { recursive: true });
  for (const [collection, records] of data) await writeFile(resolve(backupRoot, `${collection}.json`), JSON.stringify(records, null, 2), "utf8");
  const now = new Date();
  await prisma.$runCommandRaw({ update: "User", updates: [{ q: { passwordResetRequired: { $exists: false } }, u: { $set: { passwordResetRequired: false, createdAt: now, updatedAt: now } }, multi: true }, { q: { password: { $not: { $regex: "^scrypt\\$" } } }, u: { $set: { passwordResetRequired: true } }, multi: true }] });
  await prisma.$runCommandRaw({ update: "Organizer", updates: [{ q: { createdAt: { $exists: false } }, u: { $set: { createdAt: now, updatedAt: now } }, multi: true }] });
  await prisma.$runCommandRaw({ update: "Event", updates: [{ q: { reservedCount: { $exists: false } }, u: { $set: { reservedCount: 0, createdAt: now, updatedAt: now } }, multi: true }] });
  await prisma.$runCommandRaw({ update: "Registration", updates: [{ q: { status: { $exists: false } }, u: { $set: { status: "active" } }, multi: true }] });
  for (const event of events) {
    const slug = String(event.slug);
    const reservedCount = registrations.filter((registration) => registration.eventSlug === slug && (registration.status === undefined || registration.status === "active")).length;
    await prisma.$runCommandRaw({ update: "Event", updates: [{ q: { slug }, u: { $set: { reservedCount } }, multi: false }] });
  }
  await prisma.$runCommandRaw({ delete: "Session", deletes: [{ q: {}, limit: 0 }] });
  console.log(`Migration applied. Backup: ${backupRoot}. Legacy sessions were revoked; user and domain records were preserved.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
