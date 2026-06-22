import {
  AdminDashboard,
  CalendarLinks,
  City,
  CityDiscoveryModel,
  DiscoveryMode,
  Event,
  HomePayload,
  Interest,
  LocationContext,
  NavigationItem,
  Organizer,
  OrganizerDashboard,
  ParticipantDashboard,
  Role,
  User
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "" : "https://voryn-backend.onrender.com");

type RequestOptions = RequestInit & { token?: string | null };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function textRequest(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}

type HomeOptions = {
  countryCode?: string;
  coordinates?: { lat: number; lng: number };
  interests?: Interest[];
};

function addPersonalizationParams(params: URLSearchParams, options: HomeOptions = {}) {
  if (options.countryCode) params.set("countryCode", options.countryCode);
  if (options.coordinates) {
    params.set("lat", String(options.coordinates.lat));
    params.set("lng", String(options.coordinates.lng));
  }
  if (options.interests?.length) params.set("interests", options.interests.join(","));
}

export function getHome(options: HomeOptions = {}) {
  const params = new URLSearchParams();
  addPersonalizationParams(params, options);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<HomePayload>(`/api/home${suffix}`);
}

export function getLocation(options: HomeOptions = {}) {
  const params = new URLSearchParams();
  addPersonalizationParams(params, options);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<{ location: LocationContext; navigation: NavigationItem[]; interests: Interest[] }>(`/api/location${suffix}`);
}

export function getEvent(slug: string) {
  return request<{ event: Event; related: Event[]; jsonLd: unknown }>(`/api/events/${slug}`);
}

export async function reserveEvent(slug: string) {
  const response = await fetch(`${API_BASE}/api/events/${slug}/rsvp`, { method: "POST" });
  if (!response.ok) throw new Error(`Reservation failed: ${response.status}`);
  return response.json() as Promise<{ event: Event; action: "reserved" | "waitlist-joined" }>;
}

export function getCity(slug: string) {
  return request<CityDiscoveryModel>(`/api/cities/${slug}`);
}

export function getOrganizer(slug: string) {
  return request<{ organizer: Organizer; upcoming: Event[]; past: Event[] }>(`/api/organizers/${slug}`);
}

export async function followOrganizer(slug: string) {
  const response = await fetch(`${API_BASE}/api/organizers/${slug}/follow`, { method: "POST" });
  if (!response.ok) throw new Error(`Follow failed: ${response.status}`);
  return response.json() as Promise<{ organizer: Organizer; action: "followed" }>;
}

export function searchEvents(query: string, mode?: DiscoveryMode, options: HomeOptions = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (mode) params.set("mode", mode);
  addPersonalizationParams(params, options);
  return request<{ query: string; mode?: DiscoveryMode; results: Event[] }>(`/api/search?${params.toString()}`);
}

export function getCities() {
  return request<City[]>("/api/cities");
}

export function signup(input: { name: string; email: string; password: string; role: Exclude<Role, "guest"> }) {
  return request<{ token: string; user: User }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(input: { email: string; password: string }) {
  return request<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function adminSignup(input: { name: string; email: string; password: string }) {
  return request<{ token: string; user: User }>("/api/admin/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function adminLogin(input: { email: string; password: string }) {
  return request<{ token: string; user: User }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getMe(token: string) {
  return request<{ user: User | null }>("/api/auth/me", { token });
}

export function switchDashboard(token: string, dashboard: User["lastDashboard"]) {
  return request<{ user: User }>("/api/auth/switch-dashboard", {
    method: "POST",
    token,
    body: JSON.stringify({ dashboard })
  });
}

export function getParticipantDashboard(token: string) {
  return request<ParticipantDashboard>("/api/portal/participant", { token });
}

export function favoriteEvent(token: string, slug: string) {
  return request<ParticipantDashboard>(`/api/portal/participant/favorites/${slug}`, { method: "POST", token });
}

export function removeFavoriteEvent(token: string, slug: string) {
  return request<ParticipantDashboard>(`/api/portal/participant/favorites/${slug}`, { method: "DELETE", token });
}

export function registerForEvent(token: string, slug: string) {
  return request<{ dashboard: ParticipantDashboard }>(`/api/portal/participant/register/${slug}`, { method: "POST", token });
}

export function downloadTicket(token: string, slug: string) {
  return textRequest(`/api/portal/participant/tickets/${slug}`, { token });
}

export function updateNotifications(token: string, notifications: User["notifications"]) {
  return request<ParticipantDashboard>("/api/portal/participant/notifications", {
    method: "PUT",
    token,
    body: JSON.stringify(notifications)
  });
}

export function updateParticipantProfile(token: string, input: { name: string; email: string }) {
  return request<ParticipantDashboard>("/api/portal/participant/profile", {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export function followOrganizerFromDashboard(token: string, slug: string) {
  return request<ParticipantDashboard>(`/api/portal/participant/follow/${slug}`, {
    method: "POST",
    token
  });
}

export function leaveReview(token: string, slug: string, input: { rating: number; comment: string }) {
  return request<ParticipantDashboard>(`/api/portal/participant/reviews/${slug}`, {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export function getOrganizerDashboard(token: string) {
  return request<OrganizerDashboard>("/api/portal/organizer", { token });
}

export function createOrganizerEvent(token: string, input: Partial<Event> & { coverImage?: string; heroImage?: string; thumbnail?: string; priceLabel?: string }) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>("/api/portal/organizer/events", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export function updateOrganizerEvent(token: string, slug: string, input: Partial<Event> & { coverImage?: string; heroImage?: string; thumbnail?: string }) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}`, {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export function deleteOrganizerEvent(token: string, slug: string) {
  return request<{ dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}`, {
    method: "DELETE",
    token
  });
}

export function sendAnnouncement(token: string, input: { eventSlug: string; subject: string; message: string }) {
  return request<{ dashboard: OrganizerDashboard }>("/api/portal/organizer/announcements", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export function updateOrganizerProfile(token: string, input: { name: string; organizerName: string; bio: string; website: string }) {
  return request<OrganizerDashboard>("/api/portal/organizer/profile", {
    method: "PUT",
    token,
    body: JSON.stringify(input)
  });
}

export function exportAttendees(token: string) {
  return textRequest("/api/portal/organizer/attendees/export", { token });
}

export function getAdminDashboard(token: string) {
  return request<AdminDashboard>("/api/portal/admin", { token });
}

export function getCalendarLinks(slug: string) {
  return request<CalendarLinks>(`/api/events/${slug}/calendar`);
}
