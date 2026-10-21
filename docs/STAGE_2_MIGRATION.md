# Stage 2 Data Migration

## Safety sequence

1. Stop writes and create a provider-level MongoDB snapshot.
2. Deploy code with `DATABASE_URL` configured, but do not start application traffic yet.
3. Run `npm run migrate:stage2:dry-run --workspace backend`.
4. Resolve every invalid date or broken registration reference. Apply refuses to proceed while either exists.
5. Set `STAGE2_BACKUP_DIR` to encrypted durable storage outside the repository.
6. Run `npm run migrate:stage2 --workspace backend`. It backs up affected collections before changing a record and can be rerun safely.
7. From `backend/`, run `npx prisma db push`. Never use `--force-reset`.
8. Rerun the dry-run, start the API, verify `/api/ready`, compare collection counts, and sample event ownership and registration links.

## Mapping rules

- IDs, slugs, organizer ownership, registrations and legacy counters are preserved.
- Legacy events receive a two-hour end time when none exists, `UTC` when no timezone is known, embedded configuration defaults and `version: 1`.
- Legacy `sold-out` status becomes `published`; availability is subsequently derived from capacity and confirmed reservations.
- An unambiguous `Free` label creates a zero-minor-unit `Free entry` ticket.
- Any other legacy `priceLabel` is preserved but is not interpreted as a transaction or price. Registration is disabled and `migrationReviewRequired` is set until an organizer configures structured tickets.
- Registrations gain a stable `eventId`, quantity, answer container, approval status and payment status without changing their original slug link or ticket code.

## Verification performed in this workspace

On 2026-10-21, the dry run connected to the configured local `voryn` database and reported zero events, registrations, conflicts and ambiguous prices. `npx prisma db push` was then run from `backend/`; it created the new collections and all declared unique/query indexes without resetting data. No Stage 2 apply was necessary because the target collections were empty.

## Rollback

Stop the service and restore the provider snapshot (preferred). Alternatively restore the JSON collection backups into a separate recovery database, validate counts and references, and then redirect traffic. Schema additions are backward compatible, but the previous application does not understand new lifecycle states; do not run mixed application versions against writable production data.

