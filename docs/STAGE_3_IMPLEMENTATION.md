# Stage 3 — Dashboard and Management Implementation

Implementation date: 2026-10-21

## Architecture

Stage 3 introduces `backend/src/stage3.ts` for management APIs, `backend/src/audit.ts` for centralized sensitive-action logging, `frontend/src/stage3Api.ts` for typed narrow API clients, and `frontend/src/Stage3Dashboard.tsx` for the shared role-aware dashboard system. Stage 1 authentication and Stage 2 event services remain unchanged in authority.

The dashboard shell includes a persistent collapsible desktop sidebar, keyboard-accessible links and controls, active route state, mobile drawer/backdrop, breadcrumbs, global dashboard search field, role switching for organizers, profile/sign-out controls, responsive tables, status pills, loading/error/empty states, pagination and export controls. `/attendee` and `/participant` remain safe compatibility entries. New modules use `/dashboard/*`, `/organizer/*` and `/admin/*`.

## Organizer capabilities

- Database-backed overview metrics distinguish registrations, confirmed quantities, issued tickets and checked-in attendance.
- Today/7/30/90-day operational ranges, upcoming events and recent check-in activity.
- Event search/status filtering and portfolio table; Stage 2 creation/editing/lifecycle remains available at `/organizer/manage`.
- Paginated attendee directory with organizer ownership checks, event/status/search filters and CSV export.
- CSV uses RFC-style quoting, UTF-8 BOM and spreadsheet-formula neutralization.
- Explicit approval, rejection, waitlist and cancellation decisions with reason support, notification creation and audit records.
- Manual ticket entry and native `BarcodeDetector` QR scanning with permission/unsupported-browser fallback.
- Atomic compare-and-set check-in prevents duplicate admission; wrong-event, invalid, cancelled and ineligible tickets receive distinct errors.
- Check-in reversal requires a reason and creates immutable `CheckIn` and `AuditLog` entries.
- Announcement drafts, audience segmentation, history and honest provider states. An immediate send without `EMAIL_WEBHOOK_URL` is stored as `delivery_unavailable`, never “sent.”
- Event analytics use registrations and check-in records. Conversion and revenue remain unavailable without trustworthy source data.

## Participant capabilities

- Overview of upcoming/past events, ticket count, favorites, followed organizers and unread notifications.
- Registration history with approval/cancellation and attendance states kept separate.
- Ticket wallet generates scannable QR images from opaque references only for active approved free registrations or payment-verified registrations.
- Print-friendly wallet, calendar links, saved events, persisted following/unfollowing and user-scoped notification read state.
- Existing profile, password and notification preference operations remain available.

## Administrator capabilities

- Platform overview with documented active-user definition, event/publication/registration counts and moderation backlog.
- Paginated user directory, suspension/reactivation, session revocation and last-active-admin protection.
- Organizer directory and controlled verification/rejection history; verification does not grant admin role.
- Event inventory inspection, structured report queue, reviewer assignment/status/resolution and audit records.
- Protected platform-setting store that excludes secret/provider credential handling from the frontend.
- Searchable/paginated audit persistence and an admin viewer.
- Live API/database readiness and configuration-only notification/payment/background-job indicators. No uptime is fabricated.

## Data and security behavior

- New ticket credentials contain 96 bits of cryptographic randomness. Only the opaque reference is encoded in QR images; personal data is not.
- `Ticket` validity is separate from registration approval, payment and physical attendance.
- User suspension revokes sessions, and suspended accounts fail session authentication.
- All Stage 3 mutations retain session authentication and CSRF enforcement.
- Organizer operations derive their event set from the authenticated organizer slug on every request.
- Participant tickets and notifications are always filtered by authenticated user ID.
- Administrator mutations are exact-role protected and audited.
- Request correlation IDs are stored when callers provide `X-Request-ID`.

## Analytics methodology

- Registration totals: `Registration` records in scope.
- Confirmed attendance: active, approved registration quantities.
- Checked-in attendance: confirmed registrations whose authoritative flag was claimed by the check-in service; history comes from `CheckIn`.
- Remaining capacity: non-negative `Event.capacity - Event.reservedCount`; unlimited capacity remains explicit.
- Trends: registration timestamps grouped by ISO calendar day.
- Conversion: `null` because Voryn does not yet have trustworthy impression/session attribution.
- Revenue: `null` because no verified payment ledger/provider is configured. Display prices are excluded.

## External setup and deferred work

- Start or configure MongoDB, run the Stage 3 dry-run, apply it, then run `prisma db push`; see `STAGE_3_MIGRATION.md`.
- Configure `EMAIL_WEBHOOK_URL` only when a delivery worker/provider implements idempotent announcement processing. This release records queue state but does not claim delivery.
- The native camera scanner depends on browser `BarcodeDetector`; manual entry is the supported fallback.
- Payment capture/refunds/fees/multi-currency settlement remain Stage 4.
- A background announcement scheduler/provider worker, PDF ticket attachment, full admin category/location/featured-placement editor, event staff assignments and browser E2E suite remain future extensions.

## Stage 4 readiness

The model now has a safe payment boundary: admission is valid only for `paymentStatus = not_required` or `verified`, financial UI remains empty without a verified ledger, and currency values are not aggregated. Stage 4 can add provider orders, payment/refund records and webhook reconciliation without changing check-in or ticket validity semantics.
