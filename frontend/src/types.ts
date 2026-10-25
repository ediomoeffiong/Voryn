export type EventStatus = "draft" | "scheduled" | "published" | "sold-out" | "cancelled" | "completed" | "archived" | "trashed";
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
  verificationStatus?: "unverified" | "pending" | "verified" | "rejected" | "suspended";
  accountStatus?: "active" | "suspended";
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
  shortSummary: string;
  descriptionHtml: string;
  tags: string[];
  language: string;
  targetAudience: string;
  visibility: "public" | "unlisted";
  attendanceFormat: "physical" | "online" | "hybrid";
  endsAt: string | null;
  timezone: string;
  schedule: EventSession[];
  recurrence: { rule: string; exceptions: string[] } | null;
  location: EventLocation;
  registration: RegistrationSettings;
  tickets: TicketType[];
  faqs: EventFAQ[];
  speakers: EventSpeaker[];
  advancedSettings: AdvancedEventSettings;
  capacity: number | null;
  reservedCount: number;
  publishAt: string | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EventSession = { id: string; title: string; description: string; startsAt: string; endsAt: string; speakerId?: string; location: string; type: "session" | "keynote" | "workshop" | "panel" | "break" | "networking" | "other"; track: string; sortOrder: number };
export type EventLocation = { format: "physical" | "online" | "hybrid"; venueName: string; address: string; city: string; region: string; country: string; countryCode: string; postalCode: string; latitude?: number | null; longitude?: number | null; directions: string; accessibility: string; meetingPlatform: string; meetingUrl?: string; joiningInstructions?: string; accessRestriction?: string; revealAfterRegistration: boolean; physicalCapacity?: number | null; virtualCapacity?: number | null };
export type RegistrationQuestion = { id: string; label: string; type: "short_text" | "long_text" | "multiple_choice" | "checkboxes" | "dropdown" | "yes_no"; required: boolean; options: string[]; sortOrder: number };
export type RegistrationSettings = { mode: "free" | "paid" | "invite_only" | "approval" | "disabled"; opensAt?: string | null; closesAt?: string | null; accountRequired: boolean; approvalRequired: boolean; waitlistEnabled: boolean; cancellationDeadline?: string | null; confirmationMessage: string; questions: RegistrationQuestion[] };
export type TicketType = { id?: string; name: string; description: string; currency: string; priceMinor: number; capacity?: number | null; reservedCount?: number; minPerOrder: number; maxPerOrder: number; salesOpenAt?: string | null; salesCloseAt?: string | null; visibility: "public" | "hidden"; availability: "available" | "paused"; eligibility?: string; sortOrder: number };
export type EventFAQ = { id: string; question: string; answer: string; sortOrder: number };
export type EventSpeaker = { id: string; name: string; role: string; biography: string; photo: string; organization: string; socialLinks: string[] };
export type AdvancedEventSettings = { contactEmail: string; contactPhone: string; website: string; rules: string; minimumAge?: number | null; accessibility: string; refundPolicy: string; cancellationPolicy: string; terms: string; socialSharing: boolean; communicationOptIn: boolean };

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
  accountStatus?: "active" | "suspended";
  interests?: string[];
  locationPreferences?: Record<string, unknown>;
  lastActiveAt?: string;
  createdAt?: string;
};

export type Registration = {
  id: string;
  userId: string;
  eventSlug: string;
  registeredAt: string;
  checkedIn: boolean;
  ticketCode: string;
  reminders: Reminder[];
  quantity: number;
  ticketTypeId?: string;
  approvalStatus: "pending" | "approved" | "rejected";
  paymentStatus: "not_required" | "pending" | "verified" | "failed";
  status?: "active" | "cancelled" | "expired";
  statusReason?: string;
  updatedAt?: string;
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
  overview: { events: number; attendees: number; registrations: number; ticketSales: number; revenue: number | null };
  analytics: { eventSlug: string; title: string; attendeeCount: number; rsvpCount: number; ticketSalesCount: number; revenue: number | null; conversionRate: number | null }[];
  attendees: (Registration & { user: User })[];
  revenue: { total: number | null; byEvent: { eventSlug: string; title: string; revenue: number | null }[] };
  announcements: { id: string; eventSlug: string; subject: string; message: string; sentAt: string }[];
};

export type AdminDashboard = {
  users: User[];
  organizers: Organizer[];
  events: Event[];
  registrations: Registration[];
  reports: { id: string; eventSlug: string; rating: number; comment: string; createdAt: string }[];
  analytics: { users: number; organizers: number; events: number; registrations: number; revenue: number | null };
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

export type TicketOrder = {
  id: string;
  orderNumber: string;
  userId: string;
  eventId: string;
  eventSlug: string;
  status: "pending" | "processing" | "paid" | "cancelled" | "expired" | "failed" | "refunded";
  currency: string;
  subtotalMinor: number;
  feesMinor: number;
  totalMinor: number;
  paymentReference?: string;
  customerEmail: string;
  customerName: string;
  expiresAt: string;
  paidAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceMinor: number;
  quantity: number;
  subtotalMinor: number;
};

export type PaymentTransaction = {
  id: string;
  orderId: string;
  provider: string;
  reference: string;
  providerReference?: string;
  status: string;
  amountMinor: number;
  currency: string;
  channel?: string;
  customerEmail: string;
  gatewayResponse?: string;
  paidAt?: string;
  feesMinor?: number;
  createdAt: string;
};

export type Refund = {
  id: string;
  orderId: string;
  userId: string;
  eventId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: "requested" | "approved" | "processing" | "completed" | "rejected" | "failed";
  providerRefundId?: string;
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CheckoutPayload = {
  eventSlug: string;
  items: Array<{ ticketTypeId: string; quantity: number }>;
  callbackUrl?: string;
};

export type CheckoutResult = {
  order: TicketOrder;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type OrganizerRevenuePayload = {
  configured: boolean;
  currencies: string[];
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  grossFormatted: string;
  netFormatted: string;
  byEvent: Array<{
    eventId: string;
    eventSlug: string;
    title: string;
    grossMinor: number;
    refundedMinor: number;
    netMinor: number;
    ordersCount: number;
  }>;
  recentOrders: TicketOrder[];
};

export type AdminFinancialPayload = {
  totalOrders: number;
  paidOrders: number;
  totalRefunds: number;
  totalGrossMinor: number;
  totalRefundedMinor: number;
  totalNetMinor: number;
  recentLedger: Array<{
    id: string;
    type: string;
    amountMinor: number;
    currency: string;
    direction: string;
    description: string;
    createdAt: string;
  }>;
};

export type AdvancedSearchParams = {
  q?: string;
  mode?: DiscoveryMode;
  countryCode?: string;
  city?: string;
  category?: string;
  type?: string;
  format?: string;
  priceMode?: "free" | "paid" | "all";
  from?: string;
  to?: string;
  sortBy?: "soonest" | "published" | "relevant" | "popular" | "price_asc" | "price_desc";
  page?: number;
  limit?: number;
  interests?: string;
};

export type AdvancedSearchResponse = {
  query: string;
  mode?: DiscoveryMode;
  results: Event[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  suggestions: {
    categories: string[];
    cities: Array<{ name: string; slug: string; country: string }>;
  };
};
