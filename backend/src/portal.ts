import type { Request, Response } from "express";
import { cities, organizers, publicEvents } from "./data.js";
import { prisma } from "./db.js";
import type { Event, EventStatus, Interest } from "./domain.js";
import { interests } from "./personalization.js";
import { uniqueSlug } from "./slug.js";

export type Role = "guest" | "participant" | "organizer" | "admin";

type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Exclude<Role, "guest">;
  organizerSlug?: string;
  favorites: string[];
  following: string[];
  notifications: {
    email: boolean;
    push: boolean;
    smsReady: boolean;
  };
};

type Registration = {
  id: string;
  userId: string;
  eventSlug: string;
  registeredAt: string;
  checkedIn: boolean;
  ticketCode: string;
  reminders: Reminder[];
};

type Reminder = {
  channel: "email" | "push" | "sms";
  offset: "7 days before" | "1 day before" | "1 hour before" | "Event start time";
  scheduledAt: string;
  status: "scheduled" | "ready";
};

type Announcement = {
  id: string;
  organizerSlug: string;
  eventSlug: string;
  subject: string;
  message: string;
  sentAt: string;
};

type Review = {
  id: string;
  userId: string;
  eventSlug: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export const sessions = new Map<string, string>();
export const registrations: Registration[] = [];
export const announcements: Announcement[] = [];
export const reviews: Review[] = [];

export const users: User[] = [
  {
    id: "user_participant_demo",
    name: "Demo Participant",
    email: "participant@voryn.test",
    password: "password",
    role: "participant",
    favorites: ["lagos-tech-meetup-2026"],
    following: ["startup-lagos"],
    notifications: { email: true, push: true, smsReady: false }
  },
  {
    id: "user_organizer_demo",
    name: "Startup Lagos Admin",
    email: "organizer@voryn.test",
    password: "password",
    role: "organizer",
    organizerSlug: "startup-lagos",
    favorites: [],
    following: [],
    notifications: { email: true, push: true, smsReady: true }
  },
  {
    id: "user_admin_demo",
    name: "Platform Admin",
    email: "admin@voryn.test",
    password: "password",
    role: "admin",
    favorites: [],
    following: [],
    notifications: { email: true, push: true, smsReady: true }
  }
];

function safeUser(user: User) {
  const { password: _password, ...safe } = user;
  return safe;
}

function createToken(userId: string) {
  const token = `tok_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sessions.set(token, userId);
  prisma.session.create({ data: { token, userId } }).catch((err) => console.error("Failed to save session:", err));
  return token;
}

function currentUser(request: Request) {
  const header = request.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const userId = token ? sessions.get(token) : undefined;
  return userId ? users.find((user) => user.id === userId) : undefined;
}

function requireRole(request: Request, response: Response, roles: Role[]) {
  const user = currentUser(request);
  if (!user) {
    response.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  if (!roles.includes(user.role) && user.role !== "admin") {
    response.status(403).json({ error: "Role not allowed" });
    return undefined;
  }
  return user;
}

function organizerFor(user: User) {
  if (user.role === "admin") return organizers[0];
  return organizers.find((organizer) => organizer.slug === user.organizerSlug) ?? organizers[0];
}

function eventRevenue(event: Event) {
  const numeric = Number(event.priceLabel.replace(/[^\d.]/g, ""));
  const price = Number.isFinite(numeric) ? numeric : 0;
  return event.priceLabel.toLowerCase().includes("free") || event.priceLabel.toLowerCase().includes("sold")
    ? 0
    : Math.round(price * event.ticketSalesCount);
}

function registrationReminders(event: Event, user: User): Reminder[] {
  const start = new Date(event.startsAt).getTime();
  const offsets: [Reminder["offset"], number][] = [
    ["7 days before", 7 * 24 * 60 * 60 * 1000],
    ["1 day before", 24 * 60 * 60 * 1000],
    ["1 hour before", 60 * 60 * 1000],
    ["Event start time", 0]
  ];
  const channels: Reminder["channel"][] = [
    ...(user.notifications.email ? (["email"] as const) : []),
    ...(user.notifications.push ? (["push"] as const) : []),
    ...(user.notifications.smsReady ? (["sms"] as const) : [])
  ];
  return offsets.flatMap(([offset, ms]) =>
    channels.map((channel) => ({
      channel,
      offset,
      scheduledAt: new Date(start - ms).toISOString(),
      status: "scheduled" as const
    }))
  );
}

function buildIcs(event: Event) {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Voryn//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.slug}@voryn.local`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.summary}`,
    `LOCATION:${event.venue}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${event.title} starts in 1 hour`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function eventCalendarLinks(request: Request, event: Event) {
  const origin = `${request.protocol}://${request.get("host")}`;
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    details: event.summary,
    location: event.venue,
    dates: `${format(start)}/${format(end)}`
  });
  const outlookParams = new URLSearchParams({
    subject: event.title,
    body: event.summary,
    location: event.venue,
    startdt: start.toISOString(),
    enddt: end.toISOString()
  });
  return {
    google: `https://calendar.google.com/calendar/render?${params.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&${outlookParams.toString()}`,
    apple: `${origin}/api/calendar/${event.slug}.ics`
  };
}

function participantModel(user: User, request: Request) {
  const myRegistrations = registrations.filter((item) => item.userId === user.id);
  const now = Date.now();
  const registeredEvents = myRegistrations
    .map((registration) => publicEvents.find((event) => event.slug === registration.eventSlug))
    .filter((event): event is Event => Boolean(event));
  return {
    user: safeUser(user),
    favorites: user.favorites.map((slug) => publicEvents.find((event) => event.slug === slug)).filter(Boolean),
    following: user.following.map((slug) => organizers.find((organizer) => organizer.slug === slug)).filter(Boolean),
    registrations: myRegistrations,
    upcoming: registeredEvents.filter((event) => new Date(event.startsAt).getTime() >= now),
    past: registeredEvents.filter((event) => new Date(event.startsAt).getTime() < now || event.status === "completed"),
    history: registeredEvents,
    reminders: myRegistrations.flatMap((registration) => registration.reminders),
    reviews: reviews.filter((review) => review.userId === user.id),
    calendar: Object.fromEntries(registeredEvents.map((event) => [event.slug, eventCalendarLinks(request, event)]))
  };
}

function organizerModel(user: User) {
  const organizer = organizerFor(user);
  const events = publicEvents.filter((event) => event.organizerSlug === organizer.slug);
  const organizerRegistrations = registrations.filter((registration) =>
    events.some((event) => event.slug === registration.eventSlug)
  );
  const revenue = events.reduce((total, event) => total + eventRevenue(event), 0);
  return {
    user: safeUser(user),
    organizer,
    events,
    overview: {
      events: events.length,
      attendees: events.reduce((total, event) => total + event.attendeeCount, 0),
      registrations: organizerRegistrations.length,
      ticketSales: events.reduce((total, event) => total + event.ticketSalesCount, 0),
      revenue
    },
    analytics: events.map((event) => ({
      eventSlug: event.slug,
      title: event.title,
      attendeeCount: event.attendeeCount,
      rsvpCount: event.rsvpCount,
      ticketSalesCount: event.ticketSalesCount,
      revenue: eventRevenue(event),
      conversionRate: event.rsvpCount ? Number((event.ticketSalesCount / event.rsvpCount).toFixed(2)) : 0
    })),
    attendees: organizerRegistrations.map((registration) => ({
      ...registration,
      user: safeUser(users.find((item) => item.id === registration.userId)!)
    })),
    revenue: {
      total: revenue,
      byEvent: events.map((event) => ({ eventSlug: event.slug, title: event.title, revenue: eventRevenue(event) }))
    },
    announcements: announcements.filter((announcement) => announcement.organizerSlug === organizer.slug)
  };
}

function adminModel() {
  return {
    users: users.map(safeUser),
    organizers,
    events: publicEvents,
    registrations,
    reports: reviews.filter((review) => review.rating <= 2),
    analytics: {
      users: users.length,
      organizers: organizers.length,
      events: publicEvents.length,
      registrations: registrations.length,
      revenue: publicEvents.reduce((total, event) => total + eventRevenue(event), 0)
    }
  };
}

export function registerPortalRoutes(app: import("express").Express) {
  app.post("/api/auth/signup", (request, response) => {
    const role = request.body.role === "organizer" || request.body.role === "admin" ? request.body.role : "participant";
    const email = String(request.body.email ?? "").trim().toLowerCase();
    const name = String(request.body.name ?? "").trim();
    const password = String(request.body.password ?? "");
    if (!email || !name || password.length < 4) return response.status(400).json({ error: "Name, email, and password are required" });
    if (users.some((user) => user.email === email)) return response.status(409).json({ error: "Email already exists" });

    const organizerSlug = role === "organizer" ? uniqueSlug(name, new Set(organizers.map((organizer) => organizer.slug))) : undefined;
    if (organizerSlug) {
      const org = {
        name,
        slug: organizerSlug,
        profileImage: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=700&q=80",
        coverImage: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1800&q=80",
        bio: "New organizer on Voryn.",
        website: "https://voryn.example",
        socials: {},
        followers: 0,
        totalAttendeesHosted: 0
      };
      organizers.push(org as any);
      prisma.organizer.create({ data: org }).catch((err) => console.error("Failed to save organizer:", err));
    }

    const user: User = {
      id: `user_${Date.now()}`,
      name,
      email,
      password,
      role,
      organizerSlug,
      favorites: [],
      following: [],
      notifications: { email: true, push: true, smsReady: false }
    };
    users.push(user);
    prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        organizerSlug: user.organizerSlug,
        favorites: user.favorites,
        following: user.following,
        notifications: user.notifications,
      }
    }).catch((err) => console.error("Failed to save user:", err));

    response.json({ token: createToken(user.id), user: safeUser(user) });
  });

  app.post("/api/auth/login", (request, response) => {
    const email = String(request.body.email ?? "").trim().toLowerCase();
    const password = String(request.body.password ?? "");
    const user = users.find((item) => item.email === email && item.password === password);
    if (!user) return response.status(401).json({ error: "Invalid email or password" });
    response.json({ token: createToken(user.id), user: safeUser(user) });
  });

  app.get("/api/auth/me", (request, response) => {
    const user = currentUser(request);
    response.json({ user: user ? safeUser(user) : null });
  });

  app.get("/api/portal/participant", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    response.json(participantModel(user, request));
  });

  app.post("/api/portal/participant/favorites/:slug", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    if (!user.favorites.includes(request.params.slug)) {
      user.favorites.push(request.params.slug);
      prisma.user.update({
        where: { email: user.email },
        data: { favorites: user.favorites }
      }).catch((err) => console.error("Failed to update favorites:", err));
    }
    response.json(participantModel(user, request));
  });

  app.delete("/api/portal/participant/favorites/:slug", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    user.favorites = user.favorites.filter((slug) => slug !== request.params.slug);
    prisma.user.update({
      where: { email: user.email },
      data: { favorites: user.favorites }
    }).catch((err) => console.error("Failed to delete favorite:", err));
    response.json(participantModel(user, request));
  });

  app.post("/api/portal/participant/register/:slug", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!event) return response.status(404).json({ error: "Event not found" });
    let registration = registrations.find((item) => item.userId === user.id && item.eventSlug === event.slug);
    if (!registration) {
      registration = {
        id: `reg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId: user.id,
        eventSlug: event.slug,
        registeredAt: new Date().toISOString(),
        checkedIn: false,
        ticketCode: `VRY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        reminders: registrationReminders(event, user)
      };
      registrations.push(registration);
      event.rsvpCount += 1;
      event.attendeeCount += 1;
      if (event.status !== "sold-out") event.ticketSalesCount += 1;

      prisma.registration.create({ data: registration }).catch((err) => console.error("Failed to save registration:", err));
      prisma.event.update({
        where: { slug: event.slug },
        data: {
          rsvpCount: event.rsvpCount,
          attendeeCount: event.attendeeCount,
          ticketSalesCount: event.ticketSalesCount
        }
      }).catch((err) => console.error("Failed to update event registration counts:", err));
    }
    response.json({ registration, dashboard: participantModel(user, request) });
  });

  app.get("/api/portal/participant/tickets/:slug", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    const registration = registrations.find((item) => item.userId === user.id && item.eventSlug === request.params.slug);
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!registration || !event) return response.status(404).json({ error: "Ticket not found" });
    response.type("text/plain").send(`Voryn Ticket\n${event.title}\n${event.startsAt}\n${event.venue}\nCode: ${registration.ticketCode}`);
  });

  app.post("/api/portal/participant/reviews/:slug", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    const review = {
      id: `review_${Date.now()}`,
      userId: user.id,
      eventSlug: request.params.slug,
      rating: Math.max(1, Math.min(5, Number(request.body.rating ?? 5))),
      comment: String(request.body.comment ?? ""),
      createdAt: new Date().toISOString()
    };
    reviews.push(review);
    prisma.review.create({ data: review }).catch((err) => console.error("Failed to save review:", err));
    response.json(participantModel(user, request));
  });

  app.put("/api/portal/participant/notifications", (request, response) => {
    const user = requireRole(request, response, ["participant"]);
    if (!user) return;
    user.notifications = {
      email: Boolean(request.body.email),
      push: Boolean(request.body.push),
      smsReady: Boolean(request.body.smsReady)
    };
    prisma.user.update({
      where: { email: user.email },
      data: { notifications: user.notifications }
    }).catch((err) => console.error("Failed to update user notifications in DB:", err));
    response.json(participantModel(user, request));
  });

  app.get("/api/portal/organizer", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    response.json(organizerModel(user));
  });

  app.post("/api/portal/organizer/events", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    const organizer = organizerFor(user);
    const city = cities.find((item) => item.slug === request.body.citySlug) ?? cities[0];
    const title = String(request.body.title ?? "Untitled Event");
    const event: Event = {
      id: `evt_${Date.now()}`,
      title,
      slug: uniqueSlug(title, new Set(publicEvents.map((item) => item.slug))),
      citySlug: city.slug,
      country: city.country,
      category: interests.includes(request.body.category) ? request.body.category : "Technology",
      type: request.body.type === "webinar" ? "webinar" : "conference",
      mode: request.body.mode === "global" || request.body.mode === "online" ? request.body.mode : "local",
      status: (["draft", "published", "sold-out", "cancelled", "completed"].includes(request.body.status)
        ? request.body.status
        : "draft") as EventStatus,
      organizerSlug: organizer.slug,
      startsAt: String(request.body.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
      venue: String(request.body.venue ?? "TBA"),
      summary: String(request.body.summary ?? "A new event on Voryn."),
      media: {
        coverImage: String(request.body.coverImage ?? "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80"),
        heroImage: String(request.body.heroImage ?? "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1900&q=80"),
        thumbnail: String(request.body.thumbnail ?? "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=700&q=80")
      },
      attendeeCount: 0,
      rsvpCount: 0,
      ticketSalesCount: 0,
      badges: ["recently-added"],
      priceLabel: String(request.body.priceLabel ?? "Free")
    };
    publicEvents.push(event);
    prisma.event.create({
      data: {
        title: event.title,
        slug: event.slug,
        summary: event.summary,
        category: event.category,
        type: event.type,
        mode: event.mode,
        status: event.status,
        startsAt: event.startsAt,
        venue: event.venue,
        citySlug: event.citySlug,
        country: event.country,
        organizerSlug: event.organizerSlug,
        media: event.media,
        attendeeCount: event.attendeeCount,
        rsvpCount: event.rsvpCount,
        ticketSalesCount: event.ticketSalesCount,
        badges: event.badges,
        priceLabel: event.priceLabel,
      }
    }).catch((err) => console.error("Failed to create event:", err));

    response.status(201).json({ event, dashboard: organizerModel(user) });
  });

  app.put("/api/portal/organizer/events/:slug", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!event) return response.status(404).json({ error: "Event not found" });
    if (user.role !== "admin" && event.organizerSlug !== organizerFor(user).slug) return response.status(403).json({ error: "Not your event" });
    const city = cities.find((item) => item.slug === request.body.citySlug);
    Object.assign(event, {
      title: request.body.title ?? event.title,
      category: interests.includes(request.body.category) ? request.body.category : event.category,
      status: request.body.status ?? event.status,
      startsAt: request.body.startsAt ?? event.startsAt,
      venue: request.body.venue ?? event.venue,
      summary: request.body.summary ?? event.summary,
      priceLabel: request.body.priceLabel ?? event.priceLabel,
      citySlug: city?.slug ?? event.citySlug,
      country: city?.country ?? event.country,
      media: {
        ...event.media,
        coverImage: request.body.coverImage ?? event.media.coverImage,
        heroImage: request.body.heroImage ?? event.media.heroImage,
        thumbnail: request.body.thumbnail ?? event.media.thumbnail
      }
    });

    prisma.event.update({
      where: { slug: event.slug },
      data: {
        title: event.title,
        category: event.category,
        status: event.status,
        startsAt: event.startsAt,
        venue: event.venue,
        summary: event.summary,
        priceLabel: event.priceLabel,
        citySlug: event.citySlug,
        country: event.country,
        media: event.media,
      }
    }).catch((err) => console.error("Failed to update event in DB:", err));

    response.json({ event, dashboard: organizerModel(user) });
  });

  app.delete("/api/portal/organizer/events/:slug", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    const index = publicEvents.findIndex((event) => event.slug === request.params.slug);
    if (index === -1) return response.status(404).json({ error: "Event not found" });
    if (user.role !== "admin" && publicEvents[index].organizerSlug !== organizerFor(user).slug) return response.status(403).json({ error: "Not your event" });
    const [event] = publicEvents.splice(index, 1);

    prisma.event.delete({
      where: { slug: event.slug }
    }).catch((err) => console.error("Failed to delete event from DB:", err));

    response.json({ event, dashboard: organizerModel(user) });
  });

  app.post("/api/portal/organizer/announcements", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    const organizer = organizerFor(user);
    const announcement: Announcement = {
      id: `ann_${Date.now()}`,
      organizerSlug: organizer.slug,
      eventSlug: String(request.body.eventSlug ?? ""),
      subject: String(request.body.subject ?? "Event update"),
      message: String(request.body.message ?? ""),
      sentAt: new Date().toISOString()
    };
    announcements.push(announcement);
    prisma.announcement.create({ data: announcement }).catch((err) => console.error("Failed to save announcement:", err));
    response.json({ announcement, dashboard: organizerModel(user) });
  });

  app.get("/api/portal/organizer/attendees/export", (request, response) => {
    const user = requireRole(request, response, ["organizer"]);
    if (!user) return;
    const model = organizerModel(user);
    const rows = ["eventSlug,name,email,ticketCode,registeredAt"].concat(
      model.attendees.map((attendee) =>
        [attendee.eventSlug, attendee.user.name, attendee.user.email, attendee.ticketCode, attendee.registeredAt].join(",")
      )
    );
    response.header("Content-Type", "text/csv").attachment("voryn-attendees.csv").send(rows.join("\n"));
  });

  app.get("/api/portal/admin", (request, response) => {
    const user = requireRole(request, response, ["admin"]);
    if (!user) return;
    response.json(adminModel());
  });

  app.get("/api/events/:slug/calendar", (request, response) => {
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!event) return response.status(404).json({ error: "Event not found" });
    response.json(eventCalendarLinks(request, event));
  });

  app.get("/api/calendar/:slug.ics", (request, response) => {
    const event = publicEvents.find((item) => item.slug === request.params.slug);
    if (!event) return response.status(404).send("Event not found");
    response.header("Content-Type", "text/calendar").attachment(`${event.slug}.ics`).send(buildIcs(event));
  });
}
