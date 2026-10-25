import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { User } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { attachUser, issueCsrfToken, requireCsrf, requireParticipantAccess } from "./auth.js";
import { cities, organizers, publicEvents } from "./data.js";
import { disconnectDb, initDb, isDatabaseReady, prisma } from "./db.js";
import { getCityDiscoveryModel, getHomepageMetrics, getModeCollections } from "./discovery.js";
import { asyncHandler, errorHandler, HttpError } from "./http.js";
import { getNavigation, globalEvents, interests, localEventsForCountry, nearbyEvents, parseInterests, recommendedEvents, resolveLocation } from "./personalization.js";
import { currentUser, registerForEvent, registerPortalRoutes } from "./portal.js";
import crypto from "node:crypto";
import { eventJsonLd, generateRobotsTxt, generateSitemapXml } from "./seo.js";
import { searchEvents, searchEventsAdvanced } from "./search.js";
import { publicEvent, ticketsFor } from "./events.js";
import { publishDueEvents } from "./scheduler.js";
import { serveMedia } from "./media.js";
import { registerStage3Routes } from "./stage3.js";
import { registerPaymentRoutes } from "./payments/routes.js";
import { startBackgroundWorker, stopBackgroundWorker } from "./worker.js";

function allowedOrigins() {
  const configured = (process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173")).split(",").map((value) => value.trim()).filter(Boolean);
  if (process.env.NODE_ENV === "production" && (configured.length === 0 || configured.includes("*"))) throw new Error("CORS_ORIGIN must list explicit frontend origins in production");
  return configured;
}

export function createApp() {
  const app = express();
  const origins = allowedOrigins();
  if (process.env.NODE_ENV === "production") app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.disable("x-powered-by");

  // Structured request logging with request correlation ID
  app.use((request, response, next) => {
    const start = Date.now();
    const requestId = request.header("x-request-id") || crypto.randomUUID();
    response.setHeader("X-Request-ID", requestId);
    response.on("finish", () => {
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== "test") {
        console.info(`[${new Date().toISOString()}] ${request.method} ${request.originalUrl} ${response.statusCode} - ${duration}ms [Req: ${requestId}]`);
      }
    });
    next();
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin(origin, callback) { if (!origin || origins.includes(origin)) return callback(null, true); callback(new HttpError(403, "CORS origin denied")); }, credentials: true, methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"], allowedHeaders: ["Content-Type", "X-CSRF-Token"] }));
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    }
  }));
  app.post("/api/internal/publish-due", asyncHandler(async (request, response) => {
    const configured = process.env.SCHEDULER_SECRET;
    if (!configured || request.header("authorization") !== `Bearer ${configured}`) throw new HttpError(401, "Invalid scheduler credentials");
    response.json(await publishDueEvents());
  }));
  app.use(cookieParser());
  app.get("/api/auth/csrf", issueCsrfToken);
  app.use(attachUser);
  app.use(requireCsrf);

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many authentication attempts; try again later" } });
  app.use(["/api/auth/login", "/api/admin/auth/login", "/api/auth/signup", "/api/auth/password-reset/request", "/api/auth/password-reset/confirm"], authLimiter);
  registerPortalRoutes(app);
  registerStage3Routes(app);
  registerPaymentRoutes(app);

  app.get("/api/health", (_request, response) => response.json({ ok: true, service: "voryn-api" }));
  app.get("/api/media/files/:key", asyncHandler(serveMedia));
  app.get("/api/ready", asyncHandler(async (_request, response) => {
    if (!isDatabaseReady()) return response.status(503).json({ ready: false });
    try { await prisma.$runCommandRaw({ ping: 1 }); response.json({ ready: true }); }
    catch { response.status(503).json({ ready: false }); }
  }));
  app.get("/api/location", (request, response) => { const location = resolveLocation(request); response.json({ location, navigation: getNavigation(location), interests }); });
  app.get("/api/home", asyncHandler(async (request, response) => {
    const location = resolveLocation(request);
    const selectedInterests = parseInterests(request.query.interests);
    const user = await currentUser(request);
    const userContext = user
      ? {
          followedOrganizers: user.following,
          userInterests: user.interests,
          favoriteSlugs: user.favorites
        }
      : undefined;
    const recommended = recommendedEvents(location, selectedInterests, 6, userContext);
    response.json({ heroEvent: recommended[0] ?? publicEvents[0], featured: publicEvents.filter((event) => event.badges.includes("featured")), trending: publicEvents.filter((event) => event.badges.includes("trending")), recommended, nearby: nearbyEvents(location), global: globalEvents(), countryEvents: localEventsForCountry(location.countryCode), cities, organizers, location, navigation: getNavigation(location), interests, metrics: getHomepageMetrics(), modeCollections: getModeCollections() });
  }));
  app.get("/api/events", (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const city = typeof request.query.city === "string" ? request.query.city : undefined;
    const mode = typeof request.query.mode === "string" ? request.query.mode : undefined;
    response.json(publicEvents.filter((event) => (!status || event.status === status) && (!city || event.citySlug === city) && (!mode || event.mode === mode)));
  });
  app.get("/api/events/:slug", asyncHandler(async (request, response) => {
    let dbEvent = await prisma.event.findUnique({ where: { slug: String(request.params.slug) } });
    if (!dbEvent) {
      const redirected = await prisma.event.findFirst({ where: { previousSlugs: { has: String(request.params.slug) }, deletedAt: null } });
      if (redirected) return response.redirect(308, `/api/events/${redirected.slug}`);
    }
    if (!dbEvent || dbEvent.deletedAt) throw new HttpError(404, "Event not found");
    const user = await currentUser(request);
    const owner = (user?.role === "organizer" && user.organizerSlug === dbEvent.organizerSlug) || user?.role === "admin";
    const publiclyReachable = dbEvent.status === "published" || dbEvent.status === "cancelled" || dbEvent.status === "completed";
    if (!publiclyReachable && !owner) throw new HttpError(404, "Event not found");
    const isRegistered = user ? Boolean(await prisma.registration.findFirst({ where: { userId: user.id, eventSlug: dbEvent.slug, status: "active" } })) : false;
    const allTickets = await ticketsFor(dbEvent.id);
    const event = publicEvent(dbEvent, owner ? allTickets : allTickets.filter((ticket) => ticket.visibility === "public"), owner || isRegistered);
    const related = publicEvents.filter((item) => item.slug !== event.slug && item.category === event.category).slice(0, 3);
    response.json({ event, jsonLd: eventJsonLd(event as never, allTickets), related, isRegistered });
  }));
  app.post("/api/events/:slug/rsvp", requireParticipantAccess, asyncHandler(async (request, response) => {
    const registration = await registerForEvent(response.locals.user as User, String(request.params.slug), request.body ?? {});
    response.status(201).json({ registration, action: "reserved" });
  }));
  app.get("/api/cities", (_request, response) => response.json(cities));
  app.get("/api/cities/:slug", (request, response) => { const model = getCityDiscoveryModel(request.params.slug); if (!model) return response.status(404).json({ error: "City not found" }); response.json(model); });
  app.get("/api/organizers", (_request, response) => response.json(organizers));
  app.get("/api/organizers/:slug", (request, response) => {
    const organizer = organizers.find((item) => item.slug === request.params.slug);
    if (!organizer) return response.status(404).json({ error: "Organizer not found" });
    const hosted = publicEvents.filter((event) => event.organizerSlug === organizer.slug);
    response.json({ organizer, upcoming: hosted.filter((event) => event.status !== "completed"), past: hosted.filter((event) => event.status === "completed") });
  });
  app.post("/api/organizers/:slug/follow", requireParticipantAccess, asyncHandler(async (request, response) => {
    const user = response.locals.user as User;
    const organizer = await prisma.organizer.findUnique({ where: { slug: String(request.params.slug) } });
    if (!organizer) throw new HttpError(404, "Organizer not found");
    if (!user.following.includes(organizer.slug)) {
      await prisma.user.update({ where: { id: user.id }, data: { following: [...user.following, organizer.slug] } });
      await prisma.organizer.update({ where: { id: organizer.id }, data: { followers: { increment: 1 } } });
    }
    response.json({ organizer, action: "followed" });
  }));
  app.get("/api/search", asyncHandler(async (request, response) => {
    const query = typeof request.query.q === "string" ? request.query.q : "";
    const mode = request.query.mode === "local" || request.query.mode === "online" || request.query.mode === "global" ? request.query.mode : undefined;
    const countryCode = typeof request.query.countryCode === "string" ? request.query.countryCode : undefined;
    const citySlug = typeof request.query.city === "string" ? request.query.city : undefined;
    const category = typeof request.query.category === "string" ? request.query.category : undefined;
    const type = typeof request.query.type === "string" ? request.query.type : undefined;
    const attendanceFormat = typeof request.query.format === "string" ? request.query.format : undefined;
    const priceMode = request.query.priceMode === "free" || request.query.priceMode === "paid" ? request.query.priceMode : undefined;
    const from = typeof request.query.from === "string" ? request.query.from : undefined;
    const to = typeof request.query.to === "string" ? request.query.to : undefined;
    const sortBy = typeof request.query.sortBy === "string" ? (request.query.sortBy as any) : undefined;
    const page = request.query.page ? Number(request.query.page) : 1;
    const limit = request.query.limit ? Number(request.query.limit) : 12;
    const location = resolveLocation(request);

    const payload = await searchEventsAdvanced(query, {
      mode,
      countryCode,
      citySlug,
      category,
      type,
      attendanceFormat,
      priceMode,
      from,
      to,
      sortBy,
      page,
      limit,
      interests: parseInterests(request.query.interests),
      location
    });

    response.json(payload);
  }));
  app.get("/sitemap.xml", (request, response) => {
    const base = process.env.FRONTEND_URL || `${request.protocol}://${request.get("host")}`;
    response.type("application/xml").send(generateSitemapXml(base));
  });
  app.get("/robots.txt", (request, response) => {
    const base = process.env.FRONTEND_URL || `${request.protocol}://${request.get("host")}`;
    response.type("text/plain").send(generateRobotsTxt(base));
  });
  app.get(["/", "/api"], (_request, response) => response.json({ ok: true, message: "Voryn API" }));
  app.use((_request, response) => response.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
  return app;
}

export async function startServer() {
  await initDb();
  console.info("Server startup: validating configuration");
  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  const server = app.listen(port, "0.0.0.0", () => console.log(`Voryn API listening on port ${port}`));

  if (process.env.ENABLE_BACKGROUND_WORKER === "true" || process.env.NODE_ENV === "development") {
    startBackgroundWorker(10000);
  }

  const shutdown = async (signal: string) => {
    console.log(`${signal}: shutting down`);
    stopBackgroundWorker();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("Voryn failed to start");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
}
