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

const rawApiBase = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "" : "https://voryn-backend.onrender.com");
const API_BASE = rawApiBase.replace(/\/+$/, "");

type RequestOptions = RequestInit & { token?: string | null };

let csrfToken = "";

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_BASE}/api/auth/csrf`, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to initialize a secure session");
  const data = await response.json() as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers.set("X-CSRF-Token", await ensureCsrfToken());

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        if (typeof data?.error === "string") {
          errorMessage = data.error;
        } else if (typeof data?.message === "string") {
          errorMessage = data.message;
        }
      } catch {
        // ignore parse errors
      }
    }
    if (response.status === 401) {
      errorMessage = errorMessage || "Invalid username or password.";
    }
    throw new Error(errorMessage);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function textRequest(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) headers.set("X-CSRF-Token", await ensureCsrfToken());
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        if (typeof data?.error === "string") {
          errorMessage = data.error;
        } else if (typeof data?.message === "string") {
          errorMessage = data.message;
        }
      } catch {
        // ignore parse errors
      }
    }
    throw new Error(errorMessage);
  }
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

export function getEvent(slug: string, token?: string) {
  return request<{ event: Event; related: Event[]; jsonLd: unknown; isRegistered?: boolean }>(`/api/events/${slug}`, { token });
}

export async function reserveEvent(slug: string) {
  return request<{ action: "reserved"; registration: unknown }>(`/api/events/${slug}/rsvp`, { method: "POST" });
}

export function getCity(slug: string) {
  return request<CityDiscoveryModel>(`/api/cities/${slug}`);
}

export function getOrganizer(slug: string) {
  return request<{ organizer: Organizer; upcoming: Event[]; past: Event[] }>(`/api/organizers/${slug}`);
}

export async function followOrganizer(slug: string) {
  return request<{ organizer: Organizer; action: "followed" }>(`/api/organizers/${slug}/follow`, { method: "POST" });
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
  return request<{ user: User }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(input: { email: string; password: string }) {
  return request<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function adminLogin(input: { email: string; password: string }) {
  return request<{ user: User }>("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getMe(_token?: string) {
  return request<{ user: User | null }>("/api/auth/me");
}

export async function logoutSession() {
  await request<never>("/api/auth/logout", { method: "POST" }).catch((error) => {
    if (!(error instanceof SyntaxError)) throw error;
  });
  csrfToken = "";
}

export function requestPasswordReset(email: string) {
  return request<{ message: string }>("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
}

export function confirmPasswordReset(token: string, password: string) {
  return request<{ success: true }>("/api/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ success: true }>("/api/auth/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
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

export function cancelRegistrationForEvent(token: string, slug: string) {
  return request<{ dashboard: ParticipantDashboard }>(`/api/portal/participant/register/${slug}`, { method: "DELETE", token });
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

export function updateParticipantProfile(token: string, input: { name: string; email: string; profileImage?: string }) {
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

function eventWritePayload(input: Partial<Event> & { coverImage?: string; heroImage?: string; thumbnail?: string }) {
  const keys: Array<keyof Event> = ["title","slug","shortSummary","summary","descriptionHtml","category","type","mode","tags","language","targetAudience","visibility","attendanceFormat","status","startsAt","endsAt","timezone","citySlug","venue","country","schedule","recurrence","location","registration","tickets","faqs","speakers","advancedSettings","capacity","priceLabel","publishAt","version"];
  const payload: Record<string, unknown> = {}; for (const key of keys) if (input[key] !== undefined) payload[key] = input[key];
  if (input.media) Object.assign(payload, { coverImage: input.media.coverImage, heroImage: input.media.heroImage, thumbnail: input.media.thumbnail, gallery: input.media.gallery, videoTrailer: input.media.videoTrailer });
  if ((input as unknown as Record<string, unknown>).confirmMajorChange === true) payload.confirmMajorChange = true;
  return payload;
}

export function createOrganizerEvent(token: string, input: Partial<Event> & { coverImage?: string; heroImage?: string; thumbnail?: string; priceLabel?: string }) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>("/api/portal/organizer/events", {
    method: "POST",
    token,
    body: JSON.stringify(eventWritePayload(input))
  });
}

export function updateOrganizerEvent(token: string, slug: string, input: Partial<Event> & { coverImage?: string; heroImage?: string; thumbnail?: string }) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}`, {
    method: "PUT",
    token,
    body: JSON.stringify(eventWritePayload(input))
  });
}

export function deleteOrganizerEvent(token: string, slug: string, version: number) {
  return request<{ dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}?version=${version}`, {
    method: "DELETE",
    token
  });
}

export function transitionOrganizerEvent(token: string, slug: string, input: { action: "publish" | "schedule" | "unpublish" | "cancel" | "complete" | "archive" | "trash" | "restore"; version: number; reason?: string; publishAt?: string }) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}/lifecycle`, { method: "POST", token, body: JSON.stringify(input) });
}

export function duplicateOrganizerEvent(token: string, slug: string) {
  return request<{ event: Event; dashboard: OrganizerDashboard }>(`/api/portal/organizer/events/${slug}/duplicate`, { method: "POST", token });
}

export async function uploadOrganizerMedia(_token: string, file: File, altText: string, eventId?: string) {
  const body = new FormData(); body.append("file", file); body.append("altText", altText); if (eventId) body.append("eventId", eventId);
  const response = await fetch(`${API_BASE}/api/portal/organizer/media`, { method: "POST", credentials: "include", headers: { "X-CSRF-Token": await ensureCsrfToken() }, body });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Media upload failed"); }
  return response.json() as Promise<{ asset: { id: string; url: string; mimeType: string; sizeBytes: number; altText: string } }>;
}

export function sendAnnouncement(token: string, input: { eventSlug: string; subject: string; message: string }) {
  return request<{ dashboard: OrganizerDashboard }>("/api/portal/organizer/announcements", {
    method: "POST",
    token,
    body: JSON.stringify(input)
  });
}

export function decideRegistration(token: string, id: string, decision: "approved" | "rejected") {
  return request<{ dashboard: OrganizerDashboard }>(`/api/portal/organizer/registrations/${id}/approval`, { method: "POST", token, body: JSON.stringify({ decision }) });
}

export function updateOrganizerProfile(token: string, input: { name: string; organizerName: string; bio: string; website: string; profileImage?: string }) {
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
