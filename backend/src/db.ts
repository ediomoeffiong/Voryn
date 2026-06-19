import { PrismaClient } from "@prisma/client";
import { cities, organizers, publicEvents } from "./data.js";
import { users, registrations, announcements, reviews, sessions } from "./portal.js";

export const prisma = new PrismaClient();

export async function initDb() {
  try {
    console.log("Connecting to MongoDB...");
    await prisma.$connect();
    console.log("Connected to MongoDB successfully.");

    // Check if City collection is seeded
    const cityCount = await prisma.city.count();
    if (cityCount === 0) {
      console.log("Seeding default data to MongoDB...");
      
      // Seed Cities
      for (const city of cities) {
        await prisma.city.create({
          data: {
            name: city.name,
            slug: city.slug,
            country: city.country,
            countryCode: city.countryCode,
            region: city.region,
            timezone: city.timezone,
            heroImage: city.heroImage,
            coordinates: city.coordinates,
          }
        });
      }

      // Seed Organizers
      for (const org of organizers) {
        await prisma.organizer.create({
          data: {
            name: org.name,
            slug: org.slug,
            profileImage: org.profileImage,
            coverImage: org.coverImage,
            bio: org.bio,
            website: org.website,
            socials: org.socials,
            followers: org.followers,
            totalAttendeesHosted: org.totalAttendeesHosted,
          }
        });
      }

      // Seed Events
      for (const event of publicEvents) {
        await prisma.event.create({
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
        });
      }

      // Seed Users
      for (const user of users) {
        await prisma.user.create({
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
        });
      }

      console.log("Database seeded successfully.");
    } else {
      console.log("Loading data from MongoDB...");
      
      // Load Cities
      const dbCities = await prisma.city.findMany();
      cities.length = 0;
      cities.push(...dbCities.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        country: c.country,
        countryCode: c.countryCode,
        region: c.region,
        timezone: c.timezone,
        heroImage: c.heroImage,
        coordinates: c.coordinates as { lat: number; lng: number }
      })));

      // Load Organizers
      const dbOrganizers = await prisma.organizer.findMany();
      organizers.length = 0;
      organizers.push(...dbOrganizers.map(o => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        profileImage: o.profileImage,
        coverImage: o.coverImage,
        bio: o.bio,
        website: o.website,
        socials: o.socials as any,
        followers: o.followers,
        totalAttendeesHosted: o.totalAttendeesHosted
      })));

      // Load Events
      const dbEvents = await prisma.event.findMany();
      publicEvents.length = 0;
      publicEvents.push(...dbEvents.map(e => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        summary: e.summary,
        category: e.category as any,
        type: e.type as any,
        mode: e.mode as any,
        status: e.status as any,
        startsAt: e.startsAt,
        venue: e.venue,
        citySlug: e.citySlug,
        country: e.country,
        organizerSlug: e.organizerSlug,
        media: e.media as any,
        attendeeCount: e.attendeeCount,
        rsvpCount: e.rsvpCount,
        ticketSalesCount: e.ticketSalesCount,
        badges: e.badges as any,
        priceLabel: e.priceLabel
      })));

      // Load Users
      const dbUsers = await prisma.user.findMany();
      users.length = 0;
      users.push(...dbUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role as any,
        organizerSlug: u.organizerSlug ?? undefined,
        favorites: u.favorites,
        following: u.following,
        notifications: u.notifications as any
      })));

      // Load Registrations
      const dbRegistrations = await prisma.registration.findMany();
      registrations.length = 0;
      registrations.push(...dbRegistrations.map(r => ({
        id: r.id,
        userId: r.userId,
        eventSlug: r.eventSlug,
        registeredAt: r.registeredAt,
        checkedIn: r.checkedIn,
        ticketCode: r.ticketCode,
        reminders: r.reminders as any
      })));

      // Load Announcements
      const dbAnnouncements = await prisma.announcement.findMany();
      announcements.length = 0;
      announcements.push(...dbAnnouncements.map(a => ({
        id: a.id,
        organizerSlug: a.organizerSlug,
        eventSlug: a.eventSlug,
        subject: a.subject,
        message: a.message,
        sentAt: a.sentAt
      })));

      // Load Reviews
      const dbReviews = await prisma.review.findMany();
      reviews.length = 0;
      reviews.push(...dbReviews.map(r => ({
        id: r.id,
        userId: r.userId,
        eventSlug: r.eventSlug,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      })));

      // Load Sessions
      const dbSessions = await prisma.session.findMany();
      sessions.clear();
      for (const s of dbSessions) {
        sessions.set(s.token, s.userId);
      }

      console.log(`Data loaded successfully from MongoDB. Loaded: ${cities.length} cities, ${organizers.length} organizers, ${publicEvents.length} events, ${users.length} users.`);
    }
  } catch (error) {
    console.error("Failed to initialize MongoDB database:", error);
  }
}
