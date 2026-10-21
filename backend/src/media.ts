import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

const maximumBytes = Number(process.env.MEDIA_MAX_BYTES ?? 15 * 1024 * 1024);
const root = path.resolve(process.env.MEDIA_STORAGE_DIR ?? path.join(process.cwd(), ".voryn-media"));
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"]);

export const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maximumBytes, files: 1, fields: 5 } }).single("file");

export async function uploadMedia(request: Request, response: Response) {
  const user = response.locals.user as User;
  if (!request.file) throw new HttpError(422, "Choose a media file to upload");
  const detected = await fileTypeFromBuffer(request.file.buffer);
  if (!detected || !allowed.has(detected.mime)) throw new HttpError(415, "Unsupported or unrecognized media file");
  if (!allowed.has(request.file.mimetype)) throw new HttpError(415, "The declared file type is not allowed");
  if (request.file.mimetype !== detected.mime && !(request.file.mimetype === "image/jpg" && detected.mime === "image/jpeg")) throw new HttpError(415, "File content does not match its declared type");
  const eventId = typeof request.body.eventId === "string" && request.body.eventId ? request.body.eventId : undefined;
  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, organizerSlug: user.organizerSlug ?? "", deletedAt: null } });
    if (!event) throw new HttpError(403, "You cannot attach media to this event");
  }
  await mkdir(root, { recursive: true });
  const storageKey = `${randomBytes(24).toString("hex")}.${detected.ext}`;
  const target = path.resolve(root, storageKey);
  if (path.dirname(target) !== root) throw new HttpError(400, "Invalid storage key");
  await writeFile(target, request.file.buffer, { flag: "wx" });
  const configuredBase = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const url = configuredBase ? `${configuredBase}/${storageKey}` : `${request.protocol}://${request.get("host")}/api/media/files/${storageKey}`;
  const asset = await prisma.mediaAsset.create({ data: { ownerId: user.id, eventId, storageKey, url, mimeType: detected.mime, sizeBytes: request.file.size, altText: String(request.body.altText ?? "").slice(0, 500), originalName: path.basename(request.file.originalname).slice(0, 255) } });
  response.status(201).json({ asset });
}

export async function serveMedia(request: Request, response: Response) {
  const storageKey = String(request.params.key);
  if (!/^[a-f0-9]{48}\.[a-z0-9]+$/.test(storageKey)) throw new HttpError(404, "Media not found");
  const asset = await prisma.mediaAsset.findUnique({ where: { storageKey } });
  if (!asset || asset.deletedAt) throw new HttpError(404, "Media not found");
  const target = path.resolve(root, storageKey);
  if (path.dirname(target) !== root) throw new HttpError(404, "Media not found");
  response.type(asset.mimeType).setHeader("Cache-Control", "public, max-age=31536000, immutable").sendFile(target);
}

