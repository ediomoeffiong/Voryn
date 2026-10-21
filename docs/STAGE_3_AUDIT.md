# Stage 3 Audit — Dashboards and Management Systems

Audit date: 2026-10-21

## Confirmed baseline

The repository is a React 19/Vite client with an Express/Prisma/MongoDB API. Stage 1 session cookies, CSRF validation, password hashing, exact role middleware, organizer membership checks and event-ownership middleware are present. Stage 2 provides the seven-step event builder, optimistic version checks, event lifecycle transitions, ticket-type inventory, media validation and scheduled publishing. Those paths remain in use.

The worktree was clean before Stage 3 implementation. `frontend/src/App.tsx` had 2,121 lines and `backend/src/portal.ts` had 508 lines. The event builder was already separated, but every role dashboard and almost every portal endpoint still shared those two large modules.

## Confirmed problems

- Dashboard navigation used local tabs rather than durable nested URLs. `/attendee`, `/participant`, `/organizer` and `/admin` existed, but bookmarked module routes did not.
- Organizer overview counters mixed cached event counters with registrations. There were no explicit confirmed/check-in/ticket-issued/capacity definitions.
- Admin fetched up to 100 records into one mostly read-only payload and exposed no protected management workflows.
- Registrations had a Boolean `checkedIn` flag but no immutable check-in history, correction reason, actor or timestamp.
- Ticket references were cryptographically random, but no independent ticket validity record existed and the attendee ticket download was plain text.
- Registration approval did not create notifications or centralized audit records.
- Announcements were written with a `sentAt` timestamp even though no delivery provider was invoked. This could falsely represent delivery.
- Organizer attendee export was ownership-scoped but not paginated/filterable and did not neutralize spreadsheet formula injection.
- Participant notification settings existed, but user-scoped notification records and read/unread operations did not.
- Organizer following could be added but not removed from the participant portal.
- Reviews were displayed as an admin “moderation queue”; there was no report lifecycle.
- Revenue correctly returned `null`, but financial and conversion definitions were not surfaced consistently.
- User suspension, session revocation, organizer verification, last-admin protection, platform settings, audit log viewing and operational readiness were absent.
- Data tables and sidebar behavior were not sufficiently usable on mobile.

## Compatibility requirements followed

- Existing sessions and CSRF behavior remain authoritative.
- Existing event creation, autosave, editing, lifecycle and publication validation are reused at `/organizer/manage`.
- Existing aliases `/attendee` and `/participant` now enter the participant dashboard; `/organizer` and `/admin` remain valid.
- Stage 2 `priceLabel` is never used as revenue. Paid registrations still require a verified payment state before a valid ticket can exist.
- Event slugs remain available for compatibility, while new ticket/check-in/audit records use immutable database IDs.
- New legacy defaults are repaired at startup and by the explicit Stage 3 migration script.

## Implementation plan completed

1. Added a dedicated Stage 3 backend route module and centralized audit writer.
2. Added ticket, check-in, notification, moderation, audit, platform-setting and organizer-verification persistence.
3. Added narrow organizer, participant and administrator endpoints with pagination and ownership checks.
4. Added a shared responsive dashboard shell and role-aware nested routes.
5. Added secure ticket wallet/QR generation, manual/camera check-in, atomic duplicate prevention and auditable correction.
6. Added operational communications, analytics, participant notifications and admin workflows.
7. Added migration tooling, contract tests and release documentation.

## Known pre-release constraint

The configured development MongoDB endpoint (`localhost:27017`) was unavailable during this implementation. The migration tool was created and Prisma generation/type validation passed, but the data dry-run and `prisma db push` could not be completed against that offline database. See `STAGE_3_MIGRATION.md`.
