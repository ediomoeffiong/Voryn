export type EventStatus = "draft" | "published" | "sold-out" | "cancelled" | "completed";
export type DiscoveryMode = "local" | "online" | "global";
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
  type: string;
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

export type HomePayload = {
  heroEvent: Event;
  featured: Event[];
  trending: Event[];
  recommended: Event[];
  nearby: Event[];
  global: Event[];
  countryEvents: Event[];
  cities: City[];
  organizers: Organizer[];
  location: LocationContext;
  navigation: NavigationItem[];
  interests: Interest[];
  metrics: { attendees: number; rsvps: number; tickets: number };
  modeCollections: { mode: DiscoveryMode; events: Event[]; topCity?: City }[];
};

export type LocationContext = {
  country: string;
  countryCode: string;
  source: "browser" | "ip" | "default";
  coordinates?: { lat: number; lng: number };
  nearestCity?: City;
};

export type NavigationItem = {
  label: string;
  href: string;
  kind: "nearby" | "capital" | "global";
};

export type Role = "guest" | "participant" | "organizer" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, "guest">;
  lastDashboard: "participant" | "organizer" | "admin";
  organizerSlug?: string;
  favorites: string[];
  following: string[];
  notifications: { email: boolean; push: boolean; smsReady: boolean };
  profileImage?: string;
};

export type Registration = {
  id: string;
  userId: string;
  eventSlug: string;
  registeredAt: string;
  checkedIn: boolean;
  ticketCode: string;
  reminders: Reminder[];
};

export type Reminder = {
  channel: "email" | "push" | "sms";
  offset: "7 days before" | "1 day before" | "1 hour before" | "Event start time";
  scheduledAt: string;
  status: "scheduled" | "ready";
};

export type ParticipantDashboard = {
  user: User;
  favorites: Event[];
  following: Organizer[];
  registrations: Registration[];
  upcoming: Event[];
  past: Event[];
  history: Event[];
  reminders: Reminder[];
  reviews: { id: string; eventSlug: string; rating: number; comment: string; createdAt: string }[];
  calendar: Record<string, CalendarLinks>;
};

export type OrganizerDashboard = {
  user: User;
  organizer: Organizer;
  events: Event[];
  overview: { events: number; attendees: number; registrations: number; ticketSales: number; revenue: number };
  analytics: { eventSlug: string; title: string; attendeeCount: number; rsvpCount: number; ticketSalesCount: number; revenue: number; conversionRate: number }[];
  attendees: (Registration & { user: User })[];
  revenue: { total: number; byEvent: { eventSlug: string; title: string; revenue: number }[] };
  announcements: { id: string; eventSlug: string; subject: string; message: string; sentAt: string }[];
};

export type AdminDashboard = {
  users: User[];
  organizers: Organizer[];
  events: Event[];
  registrations: Registration[];
  reports: { id: string; eventSlug: string; rating: number; comment: string; createdAt: string }[];
  analytics: { users: number; organizers: number; events: number; registrations: number; revenue: number };
};

export type CalendarLinks = {
  google: string;
  outlook: string;
  apple: string;
};

export type CityDiscoveryModel = {
  city: City;
  featuredEvents: Event[];
  trendingEvents: Event[];
  upcomingEvents: Event[];
  localOrganizers: Organizer[];
  categories: string[];
  fallbackEvents: Event[];
};
