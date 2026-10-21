# Stage 3 Migration Runbook

Migration date prepared: 2026-10-21

## Schema additions

- `Ticket`: validity and opaque credential hash/display reference.
- `CheckIn`: append-only check-in and reversal history.
- `Notification`: user-scoped operational messages and read state.
- `ModerationReport`: report lifecycle, assignment and resolution.
- `AuditLog`: sensitive action accountability and optional correlation ID.
- `PlatformSetting`: non-secret administrative configuration.
- `OrganizerVerification`: controlled review history.
- `User`: account status, interests, location preferences and last activity.
- `Organizer`: account and verification status.
- `Registration`: update timestamp, status reason and supporting indexes.
- `Announcement`: audience, delivery state/provider, recipients, scheduling and authorship.

## Safe deployment sequence

1. Back up MongoDB using the platform backup mechanism.
2. Put the intended `DATABASE_URL` in `backend/.env`.
3. Run `npm run migrate:stage3:dry-run --workspace backend`.
4. Resolve any reported broken registrations or duplicate ticket codes. The apply command refuses to continue when either exists.
5. Run `npm run migrate:stage3 --workspace backend`. The script writes JSON snapshots to `backend/backups/stage3-<timestamp>` before changing legacy documents.
6. From `backend/`, run `npx prisma db push` without `--force-reset`.
7. Run `npm run typecheck`, `npm test`, and `npm run build` from the repository root.
8. Verify `/api/ready` and the admin System Health page before opening dashboard traffic.

The migration is additive. It does not delete events, registrations, announcements or existing credentials. Legacy announcements are marked `legacy_record`, not retroactively described as delivered. Legacy eligible registrations receive a `Ticket` lazily when the participant opens the wallet or an organizer verifies the code.

## Result in this workspace

Prisma Client generation and schema/type validation passed. The Stage 3 dry-run attempted to connect but stopped safely because `localhost:27017` refused the connection. No records were changed, no backup directory was created, and `prisma db push` was intentionally not run against an unavailable database.

The required follow-up is to start the intended MongoDB instance or replace `DATABASE_URL` with the deployment database, then execute the sequence above.
