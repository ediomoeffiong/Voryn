import { request, textRequest } from "./api";
import type { Event, Organizer, Registration, User } from "./types";

export type Page<T> = { items: T[]; pagination: { page: number; limit: number; total: number } };
export type AuditEntry = { id: string; actorId: string; action: string; resourceType: string; resourceId: string; metadata?: Record<string, unknown>; correlationId?: string; createdAt: string };
export type OrganizerOverview = {
  range: { from: string; to: string };
  metrics: { totalEvents: number; upcomingEvents: number; publishedEvents: number; draftEvents: number; cancelledEvents: number; totalRegistrations: number; confirmedAttendees: number; checkedInAttendees: number; ticketsIssued: number; availableCapacity: number; grossRevenue: number | null };
  upcoming: Event[];
  recentActivity: Array<{ id: string; action: string; occurredAt: string }>;
};
export type Attendee = Registration & { registrationStatus: string; user: User; ticket: TicketRecord | null; ticketType: string | null };
export type TicketRecord = { id: string; registrationId: string; eventId: string; displayCode: string; status: string; issuedAt: string };
export type WalletItem = { registration: Registration & { registrationStatus: string }; event: Event; ticket: TicketRecord | null };
export type Notification = { id: string; category: string; title: string; message: string; eventSlug?: string; readAt?: string; createdAt: string };
export type Announcement = { id: string; eventSlug: string; subject: string; message: string; audience: string; status: string; recipientCount: number; deliveryProvider?: string; scheduledAt?: string; sentAt?: string; createdAt: string };
export type Analytics = { byEvent: Array<{ eventSlug: string; title: string; registrations: number; confirmed: number; cancelled: number; waitlisted: number; checkedIn: number; checkInRate: number; remainingCapacity: number | null; conversionRate: null; revenue: null }>; trend: Array<{ date: string; count: number }>; revenue: { configured: boolean; currencies: string[]; gross: null; refunds: null; net: null } };
export type AdminOverview = { metrics: { users: number; activeUsers: number; organizers: number; events: number; publishedEvents: number; draftEvents: number; registrations: number; moderationBacklog: number; reports: number; revenue: string | null; grossRevenue?: string | null }; recentActivity: AuditEntry[]; activeUserDefinition: string };
export type ModerationReport = { id: string; reporterId: string; resourceType: string; resourceId: string; category: string; description: string; priority: string; status: string; resolution?: string; createdAt: string };
export type PlatformSetting = { id: string; key: string; value: unknown; description?: string; updatedAt: string };

function query(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
  return `${path}${search.size ? `?${search}` : ""}`;
}

export const getOrganizerOverview = (range = "30") => request<OrganizerOverview>(query("/api/stage3/organizer/overview", { from: new Date(Date.now() - Number(range) * 86400000).toISOString(), to: new Date().toISOString() }));
export const getAttendees = (params: { page?: number; q?: string; event?: string; status?: string }) => request<{ rows: Attendee[]; events: Event[]; pagination: Page<never>["pagination"] }>(query("/api/stage3/organizer/attendees", params));
export const exportStage3Attendees = (params: { q?: string; event?: string; status?: string }) => textRequest(query("/api/stage3/organizer/attendees/export", params));
export const updateRegistrationStatus = (id: string, decision: "approved" | "rejected" | "waitlisted" | "cancelled", reason?: string) => request(`/api/stage3/organizer/registrations/${id}/status`, { method: "POST", body: JSON.stringify({ decision, reason }) });
export const checkInTicket = (eventSlug: string, code: string) => request<{ result: string }>("/api/stage3/organizer/check-ins", { method: "POST", body: JSON.stringify({ eventSlug, code }) });
export const reverseCheckIn = (id: string, reason: string) => request(`/api/stage3/organizer/registrations/${id}/reverse-check-in`, { method: "POST", body: JSON.stringify({ reason }) });
export const getOrganizerAnalytics = (event?: string) => request<Analytics>(query("/api/stage3/organizer/analytics", { event }));
export const getAnnouncements = () => request<Announcement[]>("/api/stage3/organizer/announcements");
export const createAnnouncement = (input: { eventSlug: string; subject: string; message: string; audience: string; action: string; scheduledAt?: string }) => request<{ announcement: Announcement; deliveryAvailable: boolean }>("/api/stage3/organizer/announcements", { method: "POST", body: JSON.stringify(input) });

export const getWallet = () => request<WalletItem[]>("/api/stage3/participant/tickets");
export const getNotifications = (page = 1) => request<{ items: Notification[]; unread: number; pagination: Page<never>["pagination"] }>(query("/api/stage3/participant/notifications", { page }));
export const readNotifications = (ids?: string[]) => request("/api/stage3/participant/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : { all: true }) });
export const unfollowOrganizer = (slug: string) => request<void>(`/api/stage3/participant/following/${slug}`, { method: "DELETE" });

export const getAdminOverview = () => request<AdminOverview>("/api/stage3/admin/overview");
export const getAdminUsers = (params: { page?: number; q?: string; role?: string; status?: string }) => request<Page<User>>(query("/api/stage3/admin/users", params));
export const adminUserAction = (id: string, action: "suspend" | "reactivate" | "revoke_sessions" | "role", role?: string, reason?: string) => request<{ user: User }>(`/api/stage3/admin/users/${id}/actions`, { method: "POST", body: JSON.stringify({ action, role, reason }) });
export const getAdminOrganizers = (page = 1) => request<Page<Organizer & { verificationStatus: string; accountStatus: string }>>(query("/api/stage3/admin/organizers", { page }));
export const verifyOrganizer = (id: string, status: string, notes?: string) => request(`/api/stage3/admin/organizers/${id}/verification`, { method: "POST", body: JSON.stringify({ status, notes }) });
export const getReports = (status?: string) => request<Page<ModerationReport>>(query("/api/stage3/admin/reports", { status }));
export const resolveReport = (id: string, status: string, resolution?: string) => request(`/api/stage3/admin/reports/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolution }) });
export const getAuditLogs = () => request<Page<AuditEntry>>("/api/stage3/admin/audit-logs");
export const getPlatformSettings = () => request<PlatformSetting[]>("/api/stage3/admin/settings");
export const savePlatformSetting = (key: string, value: unknown, description?: string) => request(`/api/stage3/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value, description }) });
export const getSystemHealth = () => request<Record<string, string>>("/api/stage3/admin/system-health");
