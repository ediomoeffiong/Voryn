import { City, Event, Organizer } from "./domain.js";
import { uniqueSlug } from "./slug.js";

export const cities: City[] = [
  {
    id: "city_lagos",
    name: "Lagos",
    slug: "lagos",
    country: "Nigeria",
    countryCode: "NG",
    region: "Africa",
    timezone: "Africa/Lagos",
    heroImage: "https://images.unsplash.com/photo-1577948000111-9c970dfe3743?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 6.5244, lng: 3.3792 }
  },
  {
    id: "city_abuja",
    name: "Abuja",
    slug: "abuja",
    country: "Nigeria",
    countryCode: "NG",
    region: "Africa",
    timezone: "Africa/Lagos",
    heroImage: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 9.0765, lng: 7.3986 }
  },
  {
    id: "city_port_harcourt",
    name: "Port Harcourt",
    slug: "port-harcourt",
    country: "Nigeria",
    countryCode: "NG",
    region: "Africa",
    timezone: "Africa/Lagos",
    heroImage: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 4.8156, lng: 7.0498 }
  },
  {
    id: "city_london",
    name: "London",
    slug: "london",
    country: "United Kingdom",
    countryCode: "GB",
    region: "Europe",
    timezone: "Europe/London",
    heroImage: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 51.5072, lng: -0.1276 }
  },
  {
    id: "city_new_york",
    name: "New York",
    slug: "new-york",
    country: "United States",
    countryCode: "US",
    region: "North America",
    timezone: "America/New_York",
    heroImage: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 40.7128, lng: -74.006 }
  },
  {
    id: "city_washington_dc",
    name: "Washington D.C.",
    slug: "washington-dc",
    country: "United States",
    countryCode: "US",
    region: "North America",
    timezone: "America/New_York",
    heroImage: "https://images.unsplash.com/photo-1501466044931-62695aada8e9?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 38.9072, lng: -77.0369 }
  },
  {
    id: "city_ottawa",
    name: "Ottawa",
    slug: "ottawa",
    country: "Canada",
    countryCode: "CA",
    region: "North America",
    timezone: "America/Toronto",
    heroImage: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 45.4215, lng: -75.6972 }
  },
  {
    id: "city_tokyo",
    name: "Tokyo",
    slug: "tokyo",
    country: "Japan",
    countryCode: "JP",
    region: "Asia",
    timezone: "Asia/Tokyo",
    heroImage: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1800&q=80",
    coordinates: { lat: 35.6764, lng: 139.65 }
  }
];

export const organizers: Organizer[] = [
  {
    id: "org_startup_lagos",
    name: "Startup Lagos",
    slug: "startup-lagos",
    profileImage: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=700&q=80",
    coverImage: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1800&q=80",
    bio: "A founder community designing high-signal rooms for builders, operators, and investors across Africa.",
    website: "https://startuplagos.example",
    socials: { x: "@startuplagos", instagram: "@startuplagos", linkedin: "startup-lagos" },
    followers: 48200,
    totalAttendeesHosted: 128400
  },
  {
    id: "org_atlas_ai",
    name: "Atlas AI Forum",
    slug: "atlas-ai-forum",
    profileImage: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=700&q=80",
    coverImage: "https://images.unsplash.com/photo-1542744095-fcf48d80b0fd?auto=format&fit=crop&w=1800&q=80",
    bio: "Research-grade AI conversations packaged for ambitious teams, founders, and policy leaders.",
    website: "https://atlasai.example",
    socials: { x: "@atlasai", linkedin: "atlas-ai-forum" },
    followers: 92100,
    totalAttendeesHosted: 246000
  },
  {
    id: "org_signal_house",
    name: "Signal House",
    slug: "signal-house",
    profileImage: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=700&q=80",
    coverImage: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1800&q=80",
    bio: "Curated gatherings for design, product, culture, and the people shaping what comes next.",
    website: "https://signalhouse.example",
    socials: { instagram: "@signalhouse", linkedin: "signal-house" },
    followers: 37800,
    totalAttendeesHosted: 74400
  }
];

const eventSlugs = new Set<string>();

export const events: Event[] = [
  {
    id: "evt_global_ai_summit",
    title: "Global AI Summit 2026",
    slug: uniqueSlug("Global AI Summit 2026", eventSlugs),
    citySlug: "london",
    country: "United Kingdom",
    category: "Technology",
    type: "summit",
    mode: "global",
    status: "published",
    organizerSlug: "atlas-ai-forum",
    startsAt: "2026-09-18T09:00:00.000Z",
    venue: "The Docklands Forum",
    summary: "A three-day gathering for AI founders, labs, policymakers, and enterprise teams building the next decade.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 18400,
    rsvpCount: 9200,
    ticketSalesCount: 7100,
    badges: ["featured", "trending", "editors-pick"],
    priceLabel: "From $340"
  },
  {
    id: "evt_lagos_tech_meetup",
    title: "Lagos Tech Meetup 2026",
    slug: uniqueSlug("Lagos Tech Meetup 2026", eventSlugs),
    citySlug: "lagos",
    country: "Nigeria",
    category: "Startups",
    type: "meetup",
    mode: "local",
    status: "sold-out",
    organizerSlug: "startup-lagos",
    startsAt: "2026-07-24T17:00:00.000Z",
    venue: "Alliance Francaise Lagos",
    summary: "Operators, founders, and engineers meet for crisp product demos, investor office hours, and late-night conversations.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 3200,
    rsvpCount: 2900,
    ticketSalesCount: 1800,
    badges: ["popular", "recommended"],
    priceLabel: "Sold out"
  },
  {
    id: "evt_creator_economy_tokyo",
    title: "Creator Economy Tokyo",
    slug: uniqueSlug("Creator Economy Tokyo", eventSlugs),
    citySlug: "tokyo",
    country: "Japan",
    category: "Entertainment",
    type: "conference",
    mode: "global",
    status: "published",
    organizerSlug: "signal-house",
    startsAt: "2026-10-06T02:00:00.000Z",
    venue: "Shibuya Stream Hall",
    summary: "A visual, high-energy conference for creator tools, studios, agencies, and audience-led brands.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1554797589-7241bb691973?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1519638831568-d9897f54ed69?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 8700,
    rsvpCount: 4100,
    ticketSalesCount: 3600,
    badges: ["featured", "recently-added"],
    priceLabel: "From JPY 22,000"
  },
  {
    id: "evt_remote_growth_lab",
    title: "Remote Growth Lab",
    slug: uniqueSlug("Remote Growth Lab", eventSlugs),
    citySlug: "new-york",
    country: "United States",
    category: "Business",
    type: "webinar",
    mode: "online",
    status: "published",
    organizerSlug: "signal-house",
    startsAt: "2026-08-12T16:00:00.000Z",
    venue: "Online",
    summary: "A fast-moving virtual lab on retention, lifecycle systems, and growth loops for modern software teams.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1551836022-4c4c79ecde51?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 12100,
    rsvpCount: 9600,
    ticketSalesCount: 4300,
    badges: ["trending", "popular"],
    priceLabel: "Free"
  },
  {
    id: "evt_abuja_policy_week",
    title: "Abuja Policy Week",
    slug: uniqueSlug("Abuja Policy Week", eventSlugs),
    citySlug: "abuja",
    country: "Nigeria",
    category: "Community Events",
    type: "conference",
    mode: "local",
    status: "published",
    organizerSlug: "atlas-ai-forum",
    startsAt: "2026-11-03T10:00:00.000Z",
    venue: "Transcorp Hilton Abuja",
    summary: "A citywide convening for public-sector innovation, civic technology, infrastructure, and regional investment.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 6400,
    rsvpCount: 3100,
    ticketSalesCount: 2400,
    badges: ["recommended"],
    priceLabel: "From NGN 45,000"
  },
  {
    id: "evt_ph_design_festival",
    title: "Port Harcourt Design Festival",
    slug: uniqueSlug("Port Harcourt Design Festival", eventSlugs),
    citySlug: "port-harcourt",
    country: "Nigeria",
    category: "Arts",
    type: "festival",
    mode: "local",
    status: "cancelled",
    organizerSlug: "signal-house",
    startsAt: "2026-06-28T13:00:00.000Z",
    venue: "Garden City Creative Campus",
    summary: "A waterfront design festival spanning studios, food, installations, and talks from independent makers.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 1800,
    rsvpCount: 1200,
    ticketSalesCount: 940,
    badges: ["recently-added"],
    priceLabel: "Cancelled"
  },
  {
    id: "evt_dc_finance_forum",
    title: "Washington Finance Forum 2026",
    slug: uniqueSlug("Washington Finance Forum 2026", eventSlugs),
    citySlug: "washington-dc",
    country: "United States",
    category: "Finance",
    type: "conference",
    mode: "local",
    status: "published",
    organizerSlug: "atlas-ai-forum",
    startsAt: "2026-09-04T14:00:00.000Z",
    venue: "Walter E. Washington Convention Center",
    summary: "Policy, capital markets, fintech builders, and community lenders meet for practical sessions on inclusive growth.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1554224154-22dec7ec8818?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 5400,
    rsvpCount: 2600,
    ticketSalesCount: 1900,
    badges: ["recommended", "recently-added"],
    priceLabel: "From $120"
  },
  {
    id: "evt_ottawa_career_week",
    title: "Ottawa Career Week",
    slug: uniqueSlug("Ottawa Career Week", eventSlugs),
    citySlug: "ottawa",
    country: "Canada",
    category: "Career",
    type: "workshop",
    mode: "local",
    status: "published",
    organizerSlug: "signal-house",
    startsAt: "2026-08-27T15:00:00.000Z",
    venue: "Bayview Yards",
    summary: "Hiring teams, mentors, and operators run portfolio reviews, interview labs, and networking rooms for growing careers.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 4100,
    rsvpCount: 2300,
    ticketSalesCount: 1200,
    badges: ["popular", "recommended"],
    priceLabel: "Free"
  },
  {
    id: "evt_virtual_gaming_showcase",
    title: "Global Gaming Showcase Online",
    slug: uniqueSlug("Global Gaming Showcase Online", eventSlugs),
    citySlug: "tokyo",
    country: "Japan",
    category: "Gaming",
    type: "webinar",
    mode: "online",
    status: "published",
    organizerSlug: "signal-house",
    startsAt: "2026-09-29T18:00:00.000Z",
    venue: "Online",
    summary: "A virtual showcase for indie studios, esports operators, streamers, and fans following new interactive worlds.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 15600,
    rsvpCount: 11800,
    ticketSalesCount: 5200,
    badges: ["featured", "trending"],
    priceLabel: "Free"
  },
  {
    id: "evt_lagos_music_weekend",
    title: "Lagos Music Weekend",
    slug: uniqueSlug("Lagos Music Weekend", eventSlugs),
    citySlug: "lagos",
    country: "Nigeria",
    category: "Music",
    type: "festival",
    mode: "local",
    status: "published",
    organizerSlug: "signal-house",
    startsAt: "2026-12-12T18:00:00.000Z",
    venue: "Muri Okunola Park",
    summary: "Live sets, creator showcases, fashion pop-ups, and community stages across one high-energy Lagos weekend.",
    media: {
      coverImage: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80",
      heroImage: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1900&q=80",
      thumbnail: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=700&q=80"
    },
    attendeeCount: 9800,
    rsvpCount: 6100,
    ticketSalesCount: 4300,
    badges: ["trending", "popular"],
    priceLabel: "From NGN 25,000"
  }
];

export const publicEvents: Event[] = [];

export function syncPublicEvents() {
  publicEvents.length = 0;
  publicEvents.push(...events.filter((event) => (event.status === "published" || event.status === "sold-out") && event.visibility !== "unlisted"));
}

export function addEventToStore(event: Event) {
  events.push(event);
  if ((event.status === "published" || event.status === "sold-out") && event.visibility !== "unlisted") {
    publicEvents.push(event);
  }
}

export function updateEventVisibility(event: Event) {
  const index = publicEvents.findIndex((item) => item.slug === event.slug);
  if ((event.status === "published" || event.status === "sold-out") && event.visibility !== "unlisted") {
    if (index === -1) publicEvents.push(event);
  } else if (index !== -1) {
    publicEvents.splice(index, 1);
  }
}

export function removeEventFromStore(slug: string) {
  const eventIndex = events.findIndex((item) => item.slug === slug);
  if (eventIndex !== -1) events.splice(eventIndex, 1);
  const publicIndex = publicEvents.findIndex((item) => item.slug === slug);
  if (publicIndex !== -1) publicEvents.splice(publicIndex, 1);
}

syncPublicEvents();

export function getCity(slug: string) {
  return cities.find((city) => city.slug === slug);
}

export function getOrganizer(slug: string) {
  return organizers.find((organizer) => organizer.slug === slug);
}

export function getEventFromAll(slug: string) {
  return events.find((event) => event.slug === slug);
}

export function getEvent(slug: string) {
  return publicEvents.find((event) => event.slug === slug);
}

export function getEventsForCity(citySlug: string) {
  return publicEvents.filter((event) => event.citySlug === citySlug);
}
