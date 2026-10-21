import { describe, expect, it } from "vitest";
import { publicationErrors, sanitizeDescription } from "./events.js";
import { eventCreateSchema, ticketTypeSchema } from "./validation.js";

function validEvent(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() + 86400000).toISOString();
  return { id: "507f1f77bcf86cd799439011", title: "A complete event", slug: "a-complete-event", summary: "A useful summary for attendees", shortSummary: "A useful summary for attendees", descriptionHtml: "<p>Complete description</p>", category: "Technology", type: "conference", mode: "local", status: "draft", startsAt, endsAt: new Date(Date.now() + 90000000), timezone: "Africa/Lagos", venue: "Civic Hall", citySlug: "lagos", country: "Nigeria", organizerSlug: "organizer", media: {}, attendeeCount: 0, rsvpCount: 0, ticketSalesCount: 0, badges: [], priceLabel: "Free", capacity: 100, reservedCount: 0, visibility: "public", attendanceFormat: "physical", schedule: [], recurrence: null, location: { format: "physical", venueName: "Civic Hall", city: "Lagos", country: "Nigeria" }, registration: { mode: "free" }, faqs: [], speakers: [], advancedSettings: {}, tags: [], language: "en", targetAudience: "", publishAt: null, publishedAt: null, cancelledAt: null, cancellationReason: null, archivedAt: null, trashedAt: null, previousSlugs: [], version: 1, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides } as never;
}

const freeTicket = { id: "507f191e810c19729de860ea", eventId: "507f1f77bcf86cd799439011", name: "Free entry", description: "", currency: "NGN", priceMinor: 0, capacity: 100, reservedCount: 0, minPerOrder: 1, maxPerOrder: 1, salesOpenAt: null, salesCloseAt: null, visibility: "public", availability: "available", eligibility: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() } as never;

describe("Stage 2 event contracts", () => {
  it("allows an incomplete draft but rejects malformed structured values", () => {
    expect(eventCreateSchema.safeParse({ title: "" }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ visibility: "secret" }).success).toBe(false);
  });

  it("requires complete publication data and a ticket", () => {
    expect(publicationErrors(validEvent(), [freeTicket])).toEqual([]);
    const fields = publicationErrors(validEvent({ endsAt: null, location: {} }), []).map((error) => error.field);
    expect(fields).toContain("endsAt"); expect(fields).toContain("location"); expect(fields).toContain("tickets");
  });

  it("detects schedule overlaps in the same track", () => {
    const starts = new Date(Date.now() + 86400000); const schedule = [
      { title: "One", startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 3600000).toISOString(), track: "main" },
      { title: "Two", startsAt: new Date(starts.getTime() + 1800000).toISOString(), endsAt: new Date(starts.getTime() + 5400000).toISOString(), track: "main" }
    ];
    expect(publicationErrors(validEvent({ startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 7200000), schedule }), [freeTicket]).some((error) => error.message.includes("overlaps"))).toBe(true);
  });

  it("stores prices as integer minor units and validates sales windows", () => {
    expect(ticketTypeSchema.safeParse({ name: "VIP", description: "", currency: "NGN", priceMinor: 2500000, minPerOrder: 1, maxPerOrder: 2, visibility: "public", availability: "available", sortOrder: 0 }).success).toBe(true);
    expect(ticketTypeSchema.safeParse({ name: "VIP", description: "", currency: "NGN", priceMinor: 12.5, minPerOrder: 2, maxPerOrder: 1, visibility: "public", availability: "available", sortOrder: 0 }).success).toBe(false);
  });

  it("removes executable rich text while preserving supported formatting", () => {
    const clean = sanitizeDescription('<p onclick="steal()"><strong>Hello</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>');
    expect(clean).toContain("<strong>Hello</strong>"); expect(clean).not.toContain("script"); expect(clean).not.toContain("onclick"); expect(clean).not.toContain("javascript:");
  });
});

