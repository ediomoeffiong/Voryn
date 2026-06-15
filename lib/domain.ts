export type EventStatus = "draft" | "published" | "sold-out" | "cancelled" | "completed";
export type DiscoveryMode = "local" | "online" | "global";
export type EventType = "conference" | "workshop" | "meetup" | "festival" | "webinar" | "summit";
export type EventBadge = "featured" | "trending" | "recommended" | "editors-pick" | "popular" | "recently-added";

export type EventMedia = {
  coverImage: string;
  heroImage: string;
  thumbnail: string;
  gallery?: string[];
  videoTrailer?: string;
  organizerMedia?: string[];
};

export type City = {
  id: string;
  name: string;
  slug: string;
  country: string;
  countryCode: string;
  region: string;
  timezone: string;
  heroImage: string;
  coordinates: { lat: number; lng: number };
};

export type Organizer = {
  id: string;
  name: string;
  slug: string;
  profileImage: string;
  coverImage: string;
  bio: string;
  website: string;
  socials: { x?: string; instagram?: string; linkedin?: string };
  followers: number;
  totalAttendeesHosted: number;
};

export type Event = {
  id: string;
  title: string;
  slug: string;
  citySlug: string;
  country: string;
  category: string;
  type: EventType;
  mode: DiscoveryMode;
  status: EventStatus;
  organizerSlug: string;
  startsAt: string;
  venue: string;
  summary: string;
  media: EventMedia;
  attendeeCount: number;
  rsvpCount: number;
  ticketSalesCount: number;
  badges: EventBadge[];
  priceLabel: string;
};
