import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "./db.js";
import { createOpaqueToken, hashToken } from "./security.js";

export const SESSION_COOKIE = "voryn_session";
export const CSRF_COOKIE = "voryn_csrf";
const sessionHours = Number(process.env.SESSION_TTL_HOURS ?? 24 * 7);

function cookieBase(httpOnly: boolean) {
  const sameSite = process.env.COOKIE_SAME_SITE === "none" ? "none" : process.env.COOKIE_SAME_SITE === "strict" ? "strict" : "lax";
  return {
    httpOnly,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite: sameSite as "lax" | "strict" | "none",
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined
  };
}

export function safeUser(user: User) {
  const { passwordHash: _passwordHash, passwordResetRequired: _reset, ...safe } = user;
  return safe;
}

export async function createSession(response: Response, userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  response.cookie(SESSION_COOKIE, token, { ...cookieBase(true), expires: expiresAt });
}

export async function revokeSession(request: Request, response: Response) {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  response.clearCookie(SESSION_COOKIE, cookieBase(true));
}

export async function currentUser(request: Request) {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return undefined;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return undefined;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return undefined;
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.accountStatus !== "active") {
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    return undefined;
  }
  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000) {
    await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
  }
  return user;
}

export async function attachUser(request: Request, response: Response, next: NextFunction) {
  response.locals.user = await currentUser(request);
  next();
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (!response.locals.user) return response.status(401).json({ error: "Authentication required" });
  next();
}

export function requireRole(...roles: Array<User["role"]>) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.user as User | undefined;
    if (!user) return response.status(401).json({ error: "Authentication required" });
    if (!roles.includes(user.role)) return response.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

export const requireOrganizer = requireRole("organizer");
export const requireAdmin = requireRole("admin");
export const requireParticipantAccess = requireRole("participant", "organizer");

export function issueCsrfToken(_request: Request, response: Response) {
  const token = createOpaqueToken(24);
  response.cookie(CSRF_COOKIE, token, { ...cookieBase(false), maxAge: 24 * 60 * 60 * 1000 });
  response.json({ csrfToken: token });
}

export function requireCsrf(request: Request, response: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  if (request.path === "/api/payments/webhook" || request.path.startsWith("/api/internal/")) return next();
  const cookie = request.cookies?.[CSRF_COOKIE];
  const header = request.header("x-csrf-token");
  if (!cookie || !header || cookie !== header) return response.status(403).json({ error: "Invalid CSRF token" });
  next();
}

export async function requireEventOwnership(request: Request, response: Response, next: NextFunction) {
  const user = response.locals.user as User;
  const event = await prisma.event.findUnique({ where: { slug: String(request.params.slug) } });
  if (!event || event.deletedAt) return response.status(404).json({ error: "Event not found" });
  if (!user.organizerSlug || event.organizerSlug !== user.organizerSlug) return response.status(403).json({ error: "You do not own this event" });
  response.locals.event = event;
  next();
}

export function requireOrganizationPermission(_request: Request, response: Response, next: NextFunction) {
  const user = response.locals.user as User;
  if (user.role !== "organizer" || !user.organizerSlug) return response.status(403).json({ error: "Organizer membership required" });
  next();
}
