import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(["participant", "organizer"])
}).strict();

export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().max(128) }).strict();
export const dashboardSchema = z.object({ dashboard: z.enum(["participant", "organizer", "admin"]) }).strict();
export const resetRequestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const resetConfirmSchema = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().max(128), newPassword: z.string().min(12).max(128) }).strict();

export const eventCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  citySlug: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  type: z.enum(["conference", "workshop", "meetup", "festival", "webinar", "summit"]).default("conference"),
  mode: z.enum(["local", "online", "global"]).default("local"),
  status: z.enum(["draft", "published"]).default("draft"),
  startsAt: z.string().datetime(),
  venue: z.string().trim().min(2).max(300),
  summary: z.string().trim().min(10).max(5000),
  priceLabel: z.string().trim().max(100).default("Free"),
  capacity: z.number().int().positive().max(1_000_000).nullable().optional(),
  coverImage: z.string().max(2_000_000).optional(),
  heroImage: z.string().max(2_000_000).optional(),
  thumbnail: z.string().max(2_000_000).optional(),
  gallery: z.array(z.string().max(2_000_000)).max(20).optional()
}).strict();

export const eventUpdateSchema = eventCreateSchema.omit({ status: true }).partial().extend({
  status: z.enum(["draft", "published", "sold-out", "cancelled", "completed"]).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const profileSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), profileImage: z.string().max(2_000_000).optional() }).strict();
export const organizerProfileSchema = z.object({ name: z.string().trim().min(2).max(100), organizerName: z.string().trim().min(2).max(120), bio: z.string().max(2000), website: z.string().url().or(z.literal("")), profileImage: z.string().max(2_000_000).optional() }).strict();
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(2000) }).strict();
export const announcementSchema = z.object({ eventSlug: z.string().min(1), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000) }).strict();
