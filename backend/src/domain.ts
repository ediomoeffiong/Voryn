export type EventStatus = "draft" | "scheduled" | "published" | "sold-out" | "cancelled" | "completed" | "archived" | "trashed";
export type DiscoveryMode = "local" | "online" | "global";
export type EventType = "conference" | "workshop" | "meetup" | "festival" | "webinar" | "summit";
export type EventBadge = "featured" | "trending" | "recommended" | "editors-pick" | "popular" | "recently-added";
export type Interest =
  | "Technology"
  | "Business"
  | "Startups"
  | "Music"
  | "Entertainment"
  | "Sports"
  | "Networking"
  | "Education"
  | "Career"
  | "Finance"
  | "Fashion"
  | "Health"
  | "Gaming"
  | "Arts"
  | "Religion"
  | "Community Events";

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
  category: Interest;
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
  shortSummary?: string;
  descriptionHtml?: string;
  visibility?: "public" | "unlisted";
  attendanceFormat?: "physical" | "online" | "hybrid";
  endsAt?: string | null;
  timezone?: string;
  tags?: string[];
  schedule?: unknown[];
  location?: Record<string, unknown>;
  registration?: Record<string, unknown>;
  tickets?: unknown[];
  faqs?: unknown[];
  speakers?: unknown[];
  version?: number;
};
