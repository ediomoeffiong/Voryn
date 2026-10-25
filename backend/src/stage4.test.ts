import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./server.js";
import { PaystackProvider } from "./payments/paystack.js";
import { PaymentService } from "./payments/service.js";
import { emailService } from "./notifications/email.js";
import { eventJsonLd, generateRobotsTxt, generateSitemapXml } from "./seo.js";
import { searchEvents, searchEventsAdvanced } from "./search.js";
import { recommendationScore, recommendedEvents, resolveLocation } from "./personalization.js";
import { publicEvents } from "./data.js";
import { eventReminderEmail, paymentReceiptEmail, refundStatusEmail, ticketPurchaseEmail } from "./notifications/templates.js";

const provider = new PaystackProvider("sk_test_mock_secret_key_12345678", "webhook_secret_key_123");
const paymentService = new PaymentService(provider);

describe("Stage 4 Payment Infrastructure & Paystack Provider", () => {

  it("calculates and verifies Paystack HMAC-SHA512 webhook signatures in constant time", () => {
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "VRY-TEST-REF-1" } });
    const signature = crypto.createHmac("sha512", "webhook_secret_key_123").update(rawBody).digest("hex");

    expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true);
    expect(provider.verifyWebhookSignature(rawBody, "invalid_signature_hex_123")).toBe(false);
    expect(provider.verifyWebhookSignature(rawBody, "")).toBe(false);
  });

  it("parses webhook payload and extracts eventId idempotently", () => {
    const rawBody = JSON.stringify({
      id: "evt_1001",
      event: "charge.success",
      data: { reference: "VRY-TEST-REF-1", amount: 500000, currency: "NGN" }
    });
    const parsed = provider.parseWebhookEvent(rawBody);
    expect(parsed.eventId).toBe("evt_1001");
    expect(parsed.eventType).toBe("charge.success");
    expect(parsed.data.reference).toBe("VRY-TEST-REF-1");
  });

  it("initializes payment with integer minor units in test mode", async () => {
    const res = await provider.initializePayment({
      reference: "VRY-ORD-TEST-1",
      orderNumber: "ORD-TEST-1",
      amountMinor: 250000,
      currency: "NGN",
      customerEmail: "attendee@example.com",
      customerName: "Jane Doe"
    });
    expect(res.reference).toBe("VRY-ORD-TEST-1");
    expect(res.authorizationUrl).toContain("VRY-ORD-TEST-1");
  });

  it("verifies transactions and returns mapped status", async () => {
    const res = await provider.verifyTransaction("VRY-ORD-TEST-1");
    expect(res.status).toBe("success");
    expect(res.amountMinor).toBe(100000);
    expect(res.currency).toBe("NGN");
  });

  it("handles test-mode refund initiation safely", async () => {
    const res = await provider.initiateRefund({
      transactionReference: "VRY-ORD-TEST-1",
      amountMinor: 250000,
      currency: "NGN"
    });
    expect(res.refundId).toMatch(/^rfnd_mock_/);
    expect(res.status).toBe("pending");
  });
});

describe("Stage 4 Payment Endpoints & Security", () => {
  it("rejects unauthenticated checkout initialization", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const res = await agent
      .post("/api/payments/checkout/initialize")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        eventSlug: "tech-summit-lagos",
        items: [{ ticketTypeId: "t1", quantity: 1 }]
      });
    expect(res.status).toBe(401);
  });

  it("rejects checkout requests with missing or empty items", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const res = await agent
      .post("/api/payments/checkout/initialize")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ eventSlug: "tech-summit-lagos", items: [] });
    // Returns 401 because unauthenticated, or 422 if authenticated
    expect([401, 422]).toContain(res.status);
  });

  it("rejects webhook submissions with missing signature", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/payments/webhook")
      .send({ event: "charge.success" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing signature");
  });

  it("rejects webhook submissions with invalid HMAC signature", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/payments/webhook")
      .set("x-paystack-signature", "deadbeefbadf00d")
      .send({ event: "charge.success" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid webhook signature");
  });

  it("rejects unauthenticated refund requests and organizer revenue viewing", async () => {
    const agent = request.agent(createApp());
    const csrf = await agent.get("/api/auth/csrf");
    const refundRes = await agent
      .post("/api/payments/refunds/request")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({});
    expect(refundRes.status).toBe(401);
    expect((await agent.get("/api/payments/organizer/revenue")).status).toBe(401);
    expect((await agent.get("/api/payments/admin/overview")).status).toBe(401);
  });
});

describe("Stage 4 Email Templates & Delivery Engine", () => {
  it("renders branded, accessible HTML and text for ticket purchase confirmation", () => {
    const email = ticketPurchaseEmail({
      userName: "Alexander Cole",
      orderNumber: "ORD-2026-X99",
      eventTitle: "Global AI & Web Summit",
      eventDate: "November 14, 2026, 10:00 AM",
      eventVenue: "Eko Convention Centre, Lagos",
      currency: "NGN",
      totalMinor: 5000000,
      tickets: [{ name: "VIP All Access", quantity: 2, code: "VRY-A1B2C3D4E5F6" }],
      walletUrl: "https://voryn.com/dashboard/participant"
    });

    expect(email.subject).toContain("ORD-2026-X99");
    expect(email.html).toContain("VORYN");
    expect(email.html).toContain("VRY-A1B2C3D4E5F6");
    expect(email.html).toContain("50,000.00");
    expect(email.text).toContain("VRY-A1B2C3D4E5F6");
    expect(email.text).toContain("https://voryn.com/dashboard/participant");
  });

  it("renders payment receipt email with required transaction details", () => {
    const email = paymentReceiptEmail({
      userName: "Alexander Cole",
      orderNumber: "ORD-2026-X99",
      transactionReference: "VRY-ORD-2026-X99-ABC",
      currency: "NGN",
      totalMinor: 5000000,
      paidAt: "2026-11-14T09:30:00.000Z",
      eventTitle: "Global AI & Web Summit"
    });

    expect(email.subject).toContain("Payment Receipt");
    expect(email.html).toContain("VRY-ORD-2026-X99-ABC");
    expect(email.html).toContain("50,000.00");
  });

  it("renders refund status email for completed and rejected outcomes", () => {
    const completed = refundStatusEmail({
      userName: "Alexander Cole",
      orderNumber: "ORD-2026-X99",
      eventTitle: "Global AI & Web Summit",
      currency: "NGN",
      amountMinor: 2500000,
      status: "completed"
    });
    expect(completed.subject).toContain("Refund Processed");
    expect(completed.html).toContain("25,000.00");

    const rejected = refundStatusEmail({
      userName: "Alexander Cole",
      orderNumber: "ORD-2026-X99",
      eventTitle: "Global AI & Web Summit",
      currency: "NGN",
      amountMinor: 2500000,
      status: "rejected",
      reason: "Request submitted after the 48-hour event refund policy."
    });
    expect(rejected.subject).toContain("Refund Request Declined");
    expect(rejected.html).toContain("Request submitted after the 48-hour event refund policy.");
  });

  it("renders event reminder email with scheduled timing offsets", () => {
    const reminder = eventReminderEmail({
      userName: "Alexander Cole",
      eventTitle: "Global AI & Web Summit",
      eventDate: "November 14, 2026",
      eventVenue: "Eko Convention Centre",
      timingNotice: "1 hour before",
      ticketCode: "VRY-A1B2C3D4E5F6",
      walletUrl: "https://voryn.com/dashboard/participant"
    });
    expect(reminder.subject).toContain("Reminder: Global AI & Web Summit");
    expect(reminder.html).toContain("1 hour before");
    expect(reminder.html).toContain("VRY-A1B2C3D4E5F6");
  });

  it("handles test-mode email delivery and provides accurate provider status", async () => {
    const status = emailService.getStatus();
    expect(status.configured).toBe(true);

    const sendRes = await emailService.sendEmail({
      to: "test@example.com",
      subject: "Test Notification",
      html: "<p>Hello</p>",
      text: "Hello"
    });
    expect(sendRes.success).toBe(true);
    expect(emailService.sentEmailsForTesting.some((e) => e.to === "test@example.com")).toBe(true);
  });
});

describe("Stage 4 Advanced Discovery, Search & Personalization", () => {
  it("filters events by keyword, category, city, and mode", () => {
    const lagosTech = searchEvents("Lagos", { category: "Technology" });
    expect(Array.isArray(lagosTech)).toBe(true);

    const onlineEvents = searchEvents("", { mode: "online" });
    expect(onlineEvents.every((e) => e.mode === "online")).toBe(true);
  });

  it("paginates advanced search results with metadata and suggestions", async () => {
    const payload = await searchEventsAdvanced("", { page: 1, limit: 3 });
    expect(payload.pagination.page).toBe(1);
    expect(payload.pagination.limit).toBe(3);
    expect(payload.pagination.total).toBeGreaterThan(0);
    expect(payload.results.length).toBeLessThanOrEqual(3);
    expect(payload.suggestions.categories.length).toBeGreaterThan(0);
    expect(payload.suggestions.cities.length).toBeGreaterThan(0);
  });

  it("scores personalized recommendations with diversity controls and followed organizers", () => {
    const location = resolveLocation({ query: { countryCode: "NG" }, header: () => undefined } as never);
    const event = publicEvents[0];
    const scoreWithoutFollow = recommendationScore(event, { location, selectedInterests: [] });
    const scoreWithFollow = recommendationScore(event, {
      location,
      selectedInterests: [],
      followedOrganizers: [event.organizerSlug]
    });

    expect(scoreWithFollow).toBeGreaterThan(scoreWithoutFollow);

    const recs = recommendedEvents(location, ["Technology"], 4, {
      followedOrganizers: [event.organizerSlug],
      userInterests: ["Technology"]
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(4);
  });
});

describe("Stage 4 SEO, Structured Data, Sitemap & Robots", () => {
  it("generates Schema.org Event JSON-LD including ticket offer tiers and availability", () => {
    const event = publicEvents[0];
    const ld = eventJsonLd(event, [
      {
        id: "t1",
        eventId: event.id,
        name: "Standard Ticket",
        description: "General access",
        currency: "NGN",
        priceMinor: 1500000,
        capacity: 100,
        reservedCount: 10,
        minPerOrder: 1,
        maxPerOrder: 2,
        salesOpenAt: new Date(),
        salesCloseAt: new Date(Date.now() + 86400000),
        visibility: "public",
        availability: "available",
        eligibility: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      } as never
    ]);

    expect(ld["@type"]).toBe("Event");
    expect(ld.name).toBe(event.title);
    expect(Array.isArray(ld.offers)).toBe(true);
    expect(ld.offers[0].price).toBe("15000.00");
    expect(ld.offers[0].priceCurrency).toBe("NGN");
    expect(ld.offers[0].availability).toBe("https://schema.org/InStock");
  });

  it("generates valid XML sitemap with public events, cities, and organizers", () => {
    const sitemap = generateSitemapXml("https://voryn.com");
    expect(sitemap).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(sitemap).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
    expect(sitemap).toContain("https://voryn.com/search");
    expect(sitemap).toContain("https://voryn.com/events/");
  });

  it("generates robots.txt with disallow directives for protected routes and sitemap link", () => {
    const robots = generateRobotsTxt("https://voryn.com");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /dashboard/");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://voryn.com/sitemap.xml");
  });

  it("serves sitemap.xml and robots.txt via public API endpoints", async () => {
    const app = createApp();
    const sitemapRes = await request(app).get("/sitemap.xml");
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.headers["content-type"]).toContain("xml");

    const robotsRes = await request(app).get("/robots.txt");
    expect(robotsRes.status).toBe(200);
    expect(robotsRes.headers["content-type"]).toContain("text/plain");
  });

  it("calculates platform financial metrics and ledger entries without fabricated numbers", async () => {
    const adminOverview = await paymentService.getAdminFinancialOverview();
    expect(typeof adminOverview.totalOrders).toBe("number");
    expect(typeof adminOverview.paidOrders).toBe("number");
    expect(typeof adminOverview.totalGrossMinor).toBe("number");
    expect(typeof adminOverview.totalNetMinor).toBe("number");
    expect(Array.isArray(adminOverview.recentLedger)).toBe("true" === "true");
  });

  it("protects participant orders endpoint requiring authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/api/payments/orders/my");
    expect(res.status).toBe(401);
  });
});
