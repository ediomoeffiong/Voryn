import cors from "cors";
import express from "express";
import { cities, organizers, publicEvents } from "./data.js";
import { initDb, prisma } from "./db.js";
import { getCityDiscoveryModel, getHomepageMetrics, getModeCollections } from "./discovery.js";
import {
  getNavigation,
  globalEvents,
  interests,
  localEventsForCountry,
  nearbyEvents,
  parseInterests,
  recommendedEvents,
  resolveLocation
} from "./personalization.js";
import { registerPortalRoutes } from "./portal.js";
import { eventJsonLd } from "./seo.js";
import { searchEvents } from "./search.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

const corsOptions = {
  origin: corsOrigin,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
};

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (request.method === "OPTIONS") {
    return response.sendStatus(204);
  }
  next();
});

app.use(cors(corsOptions));
app.use(express.json());
registerPortalRoutes(app);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "voryn-api" });
});

app.get("/api/location", (request, response) => {
  const location = resolveLocation(request);
  response.json({
    location,
    navigation: getNavigation(location),
    interests
  });
});

app.get("/api/home", (request, response) => {
  const location = resolveLocation(request);
  const selectedInterests = parseInterests(request.query.interests);
  const recommended = recommendedEvents(location, selectedInterests);
  const localForCountry = localEventsForCountry(location.countryCode);

  response.json({
    heroEvent: recommended[0] ?? publicEvents[0],
    featured: publicEvents.filter((event) => event.badges.includes("featured")),
    trending: publicEvents.filter((event) => event.badges.includes("trending")),
    recommended,
    nearby: nearbyEvents(location),
    global: globalEvents(),
    countryEvents: localForCountry,
    cities,
    organizers,
    location,
    navigation: getNavigation(location),
    interests,
    metrics: getHomepageMetrics(),
    modeCollections: getModeCollections()
  });
});

app.get("/api/events", (request, response) => {
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const city = typeof request.query.city === "string" ? request.query.city : undefined;
  const mode = typeof request.query.mode === "string" ? request.query.mode : undefined;

  response.json(
    publicEvents.filter((event) => {
      if (status && event.status !== status) return false;
      if (city && event.citySlug !== city) return false;
      if (mode && event.mode !== mode) return false;
      return true;
    })
  );
});

app.get("/api/events/:slug", (request, response) => {
  const event = publicEvents.find((item) => item.slug === request.params.slug);
  if (!event) return response.status(404).json({ error: "Event not found" });

  const related = publicEvents
    .filter((item) => item.slug !== event.slug && item.category === event.category)
    .slice(0, 3);

  return response.json({ event, jsonLd: eventJsonLd(event), related });
});

app.post("/api/events/:slug/rsvp", (request, response) => {
  const event = publicEvents.find((item) => item.slug === request.params.slug);
  if (!event) return response.status(404).json({ error: "Event not found" });
  if (event.status === "cancelled") return response.status(409).json({ error: "Event is cancelled" });

  event.rsvpCount += 1;

  if (event.status !== "sold-out") {
    event.attendeeCount += 1;
    event.ticketSalesCount += 1;
  }

  prisma.event.update({
    where: { slug: event.slug },
    data: {
      rsvpCount: event.rsvpCount,
      attendeeCount: event.attendeeCount,
      ticketSalesCount: event.ticketSalesCount
    }
  }).catch(err => console.error("Failed to update event RSVP in DB:", err));

  return response.json({
    event,
    action: event.status === "sold-out" ? "waitlist-joined" : "reserved"
  });
});

app.get("/api/cities", (_request, response) => {
  response.json(cities);
});

app.get("/api/cities/:slug", (request, response) => {
  const model = getCityDiscoveryModel(request.params.slug);
  if (!model) return response.status(404).json({ error: "City not found" });
  return response.json(model);
});

app.get("/api/organizers", (_request, response) => {
  response.json(organizers);
});

app.get("/api/organizers/:slug", (request, response) => {
  const organizer = organizers.find((item) => item.slug === request.params.slug);
  if (!organizer) return response.status(404).json({ error: "Organizer not found" });

  const hosted = publicEvents.filter((event) => event.organizerSlug === organizer.slug);
  return response.json({
    organizer,
    upcoming: hosted.filter((event) => event.status !== "completed"),
    past: hosted.filter((event) => event.status === "completed")
  });
});

app.post("/api/organizers/:slug/follow", (request, response) => {
  const organizer = organizers.find((item) => item.slug === request.params.slug);
  if (!organizer) return response.status(404).json({ error: "Organizer not found" });

  organizer.followers += 1;

  prisma.organizer.update({
    where: { slug: organizer.slug },
    data: { followers: organizer.followers }
  }).catch(err => console.error("Failed to update organizer followers in DB:", err));

  return response.json({ organizer, action: "followed" });
});

app.get("/api/search", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const mode = typeof request.query.mode === "string" ? request.query.mode : undefined;
  const countryCode = typeof request.query.countryCode === "string" ? request.query.countryCode : undefined;
  const safeMode = mode === "local" || mode === "online" || mode === "global" ? mode : undefined;
  const selectedInterests = parseInterests(request.query.interests);
  const location = resolveLocation(request);

  response.json({
    query,
    mode: safeMode,
    results: searchEvents(query, { mode: safeMode, countryCode, interests: selectedInterests, location })
  });
});

app.get("/", (_request, response) => {
  response.json({ ok: true, message: "Welcome to Voryn API. Health endpoint at /api/health." });
});

app.get("/api", (_request, response) => {
  response.json({ ok: true, message: "Voryn API is active. Check /api/health for system status." });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found" });
});

initDb().then(() => {
  app.listen(port, () => {
    console.log(`Voryn API listening on http://localhost:${port}`);
  });
});
