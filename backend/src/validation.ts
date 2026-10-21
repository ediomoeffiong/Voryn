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

const optionalUrl = z.union([z.string().trim().url().max(2048).refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) URLs are allowed"), z.literal("")]);
const isoDate = z.string().datetime({ offset: true });

export const ticketTypeSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).default(""),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("NGN"), priceMinor: z.number().int().min(0).max(2_000_000_000),
  capacity: z.number().int().positive().max(1_000_000).nullable().optional(), minPerOrder: z.number().int().min(1).max(100).default(1),
  maxPerOrder: z.number().int().min(1).max(100).default(1), salesOpenAt: isoDate.nullable().optional(), salesCloseAt: isoDate.nullable().optional(),
  visibility: z.enum(["public", "hidden"]).default("public"), availability: z.enum(["available", "paused"]).default("available"),
  eligibility: z.string().trim().max(500).optional(), sortOrder: z.number().int().min(0).default(0)
}).strict().refine((ticket) => ticket.maxPerOrder >= ticket.minPerOrder, { message: "Maximum per order must not be below minimum", path: ["maxPerOrder"] })
  .refine((ticket) => !ticket.salesOpenAt || !ticket.salesCloseAt || new Date(ticket.salesCloseAt) > new Date(ticket.salesOpenAt), { message: "Ticket sales must close after they open", path: ["salesCloseAt"] });

const sessionSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().trim().min(1).max(200), description: z.string().max(2000).default(""),
  startsAt: isoDate, endsAt: isoDate, speakerId: z.string().max(100).optional(), location: z.string().max(500).default(""),
  type: z.enum(["session", "keynote", "workshop", "panel", "break", "networking", "other"]).default("session"),
  track: z.string().trim().max(100).default("main"), sortOrder: z.number().int().min(0).default(0)
}).strict().refine((item) => new Date(item.endsAt) > new Date(item.startsAt), { message: "Session end must be after its start", path: ["endsAt"] });

const locationSchema = z.object({
  format: z.enum(["physical", "online", "hybrid"]), venueName: z.string().max(200).default(""), address: z.string().max(500).default(""),
  city: z.string().max(120).default(""), region: z.string().max(120).default(""), country: z.string().max(120).default(""),
  countryCode: z.string().max(2).default(""), postalCode: z.string().max(30).default(""), latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(), directions: z.string().max(2000).default(""), accessibility: z.string().max(2000).default(""),
  meetingPlatform: z.string().max(100).default(""), meetingUrl: optionalUrl.default(""), joiningInstructions: z.string().max(3000).default(""),
  accessRestriction: z.string().max(500).default(""), revealAfterRegistration: z.boolean().default(true), physicalCapacity: z.number().int().positive().nullable().optional(),
  virtualCapacity: z.number().int().positive().nullable().optional()
}).strict();

const questionSchema = z.object({
  id: z.string().min(1).max(100), label: z.string().trim().min(1).max(300), type: z.enum(["short_text", "long_text", "multiple_choice", "checkboxes", "dropdown", "yes_no"]),
  required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(200)).max(50).default([]), sortOrder: z.number().int().min(0).default(0)
}).strict();

const registrationSchema = z.object({
  mode: z.enum(["free", "paid", "invite_only", "approval", "disabled"]).default("free"), opensAt: isoDate.nullable().optional(), closesAt: isoDate.nullable().optional(),
  accountRequired: z.boolean().default(true), approvalRequired: z.boolean().default(false), waitlistEnabled: z.boolean().default(false),
  cancellationDeadline: isoDate.nullable().optional(), confirmationMessage: z.string().max(2000).default(""), questions: z.array(questionSchema).max(40).default([])
}).strict();

const faqSchema = z.object({ id: z.string().min(1).max(100), question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(3000), sortOrder: z.number().int().min(0).default(0) }).strict();
const speakerSchema = z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(150), role: z.string().max(150).default(""), biography: z.string().max(3000).default(""), photo: optionalUrl.default(""), organization: z.string().max(200).default(""), socialLinks: z.array(optionalUrl).max(10).default([]) }).strict();

const eventFields = {
  title: z.string().trim().max(160).optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180).optional(),
  shortSummary: z.string().trim().max(300).optional(), summary: z.string().trim().max(5000).optional(), descriptionHtml: z.string().max(100_000).optional(),
  category: z.string().trim().max(100).optional(), type: z.enum(["conference", "seminar", "workshop", "webinar", "meetup", "concert", "festival", "networking", "exhibition", "hackathon", "tournament", "training", "community", "other", "summit"]).optional(),
  mode: z.enum(["local", "online", "global"]).optional(), tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(), language: z.string().trim().max(35).optional(), targetAudience: z.string().max(1000).optional(),
  visibility: z.enum(["public", "unlisted"]).optional(), attendanceFormat: z.enum(["physical", "online", "hybrid"]).optional(), status: z.enum(["draft", "scheduled", "published", "cancelled", "completed", "archived", "trashed"]).optional(),
  startsAt: isoDate.optional(), endsAt: isoDate.nullable().optional(), timezone: z.string().trim().max(100).optional(), citySlug: z.string().trim().max(120).optional(), venue: z.string().trim().max(300).optional(), country: z.string().trim().max(120).optional(),
  schedule: z.array(sessionSchema).max(200).optional(), recurrence: z.object({ rule: z.string().max(1000), exceptions: z.array(isoDate).max(100) }).strict().nullable().optional(), location: locationSchema.optional(),
  registration: registrationSchema.optional(), tickets: z.array(ticketTypeSchema).max(50).optional(), faqs: z.array(faqSchema).max(50).optional(), speakers: z.array(speakerSchema).max(100).optional(),
  advancedSettings: z.object({ contactEmail: z.union([z.string().email().max(254), z.literal("")]).default(""), contactPhone: z.string().max(40).default(""), website: optionalUrl.default(""), rules: z.string().max(10000).default(""), minimumAge: z.number().int().min(0).max(120).nullable().optional(), accessibility: z.string().max(5000).default(""), refundPolicy: z.string().max(10000).default(""), cancellationPolicy: z.string().max(10000).default(""), terms: z.string().max(20000).default(""), socialSharing: z.boolean().default(true), communicationOptIn: z.boolean().default(true) }).strict().optional(),
  capacity: z.number().int().positive().max(1_000_000).nullable().optional(), coverImage: optionalUrl.optional(), heroImage: optionalUrl.optional(), thumbnail: optionalUrl.optional(), gallery: z.array(optionalUrl).max(20).optional(), videoTrailer: optionalUrl.optional(),
  priceLabel: z.string().trim().max(100).optional(), version: z.number().int().positive().optional(), publishAt: isoDate.nullable().optional(), confirmMajorChange: z.boolean().optional()
};

export const eventCreateSchema = z.object(eventFields).strict();
export const eventUpdateSchema = z.object(eventFields).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const lifecycleSchema = z.object({ action: z.enum(["publish", "schedule", "unpublish", "cancel", "complete", "archive", "trash", "restore"]), reason: z.string().trim().max(2000).optional(), publishAt: isoDate.optional(), version: z.number().int().positive() }).strict();
export const profileSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), profileImage: z.string().max(2_000_000).optional() }).strict();
export const organizerProfileSchema = z.object({ name: z.string().trim().min(2).max(100), organizerName: z.string().trim().min(2).max(120), bio: z.string().max(2000), website: z.string().url().or(z.literal("")), profileImage: z.string().max(2_000_000).optional() }).strict();
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(2000) }).strict();
export const announcementSchema = z.object({ eventSlug: z.string().min(1), subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000) }).strict();
