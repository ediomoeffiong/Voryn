import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type Document = Record<string, unknown>;
function idText(value: unknown) { if (typeof value === "string") return value; if (value && typeof value === "object" && "$oid" in value) return String((value as { $oid: unknown }).$oid); return ""; }
async function raw(collection: "User" | "Organizer" | "Registration" | "Announcement") {
  const rows = collection === "User" ? await prisma.user.findRaw({ filter: {} }) : collection === "Organizer" ? await prisma.organizer.findRaw({ filter: {} }) : collection === "Registration" ? await prisma.registration.findRaw({ filter: {} }) : await prisma.announcement.findRaw({ filter: {} });
  if (!Array.isArray(rows)) throw new Error(`Unexpected ${collection} result`); return rows as Document[];
}

async function main() {
  const apply = process.argv.includes("--apply"); await prisma.$connect();
  const names = ["User", "Organizer", "Registration", "Announcement"] as const; const data = new Map<string, Document[]>(); for (const name of names) data.set(name, await raw(name));
  const users = data.get("User") ?? []; const organizers = data.get("Organizer") ?? []; const registrations = data.get("Registration") ?? []; const announcements = data.get("Announcement") ?? [];
  const userIds = new Set(users.map((item) => idText(item._id))); const brokenRegistrations = registrations.filter((item) => !userIds.has(String(item.userId))).length;
  const duplicateTicketCodes = registrations.length - new Set(registrations.map((item) => String(item.ticketCode))).size;
  const report = { mode: apply ? "apply" : "dry-run", counts: { users: users.length, organizers: organizers.length, registrations: registrations.length, announcements: announcements.length }, repairs: { users: users.filter((item) => item.accountStatus == null || item.interests == null).length, organizers: organizers.filter((item) => item.verificationStatus == null || item.accountStatus == null).length, registrations: registrations.filter((item) => item.updatedAt == null || item.statusReason === undefined).length, announcements: announcements.filter((item) => item.status == null || item.createdAt == null).length }, conflicts: { brokenRegistrations, duplicateTicketCodes } };
  console.log(JSON.stringify(report, null, 2)); if (!apply) return; if (brokenRegistrations || duplicateTicketCodes) throw new Error("Broken registrations or duplicate ticket codes require manual review; no changes were applied");
  const backupRoot = resolve(process.env.STAGE3_BACKUP_DIR ?? "backups", `stage3-${new Date().toISOString().replace(/[:.]/g, "-")}`); await mkdir(backupRoot, { recursive: true }); for (const [name, rows] of data) await writeFile(resolve(backupRoot, `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
  const date = { $date: new Date().toISOString() };
  await prisma.$runCommandRaw({ update: "User", updates: [{ q: { accountStatus: null }, u: { $set: { accountStatus: "active" } }, multi: true }, { q: { interests: null }, u: { $set: { interests: [] } }, multi: true }] } as Prisma.InputJsonObject);
  await prisma.$runCommandRaw({ update: "Organizer", updates: [{ q: { verificationStatus: null }, u: { $set: { verificationStatus: "unverified" } }, multi: true }, { q: { accountStatus: null }, u: { $set: { accountStatus: "active" } }, multi: true }] } as Prisma.InputJsonObject);
  await prisma.$runCommandRaw({ update: "Registration", updates: [{ q: { updatedAt: null }, u: { $set: { updatedAt: date, statusReason: null } }, multi: true }] } as Prisma.InputJsonObject);
  await prisma.$runCommandRaw({ update: "Announcement", updates: [{ q: { status: null }, u: { $set: { audience: "confirmed", status: "legacy_record", deliveryProvider: null, recipientCount: 0, scheduledAt: null, createdById: null, createdAt: date, updatedAt: date } }, multi: true }] } as Prisma.InputJsonObject);
  console.log(`Stage 3 migration applied. Backup: ${backupRoot}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
