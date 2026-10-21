# Stage 1 Data Migration

## Safety sequence

1. Stop application writes and take a provider-level MongoDB snapshot.
2. Configure `DATABASE_URL` against the intended database.
3. Run `npm run migrate:stage1:dry-run --workspace backend`. It reports counts, legacy credentials, duplicate normalized emails, duplicate registrations, and broken references.
4. Resolve every reported conflict manually. Apply refuses to change records while conflicts exist.
5. Set `STAGE1_BACKUP_DIR` to encrypted storage outside the repository, then run `npm run migrate:stage1 --workspace backend`. It writes collection-level JSON backups before mutation.
6. Run `npx prisma db push --schema backend/prisma/schema.prisma`. Never use `--force-reset`.
7. Run the dry-run again, start the API, and verify `/api/ready` returns 200.
8. Compare collection counts and sample ownership/registration relationships with the pre-change report.

The migration is repeatable. Missing defaults are added idempotently and the capacity reservation count is recalculated from active registrations. Legacy sessions are revoked. Plaintext-looking passwords are preserved, never printed, marked `passwordResetRequired`, and cannot authenticate. Users recover through a single-use 30-minute reset token once `EMAIL_WEBHOOK_URL` is configured.

Duplicate email/registration keys and broken references are never guessed or overwritten. To roll back, stop the service and restore the provider snapshot (preferred) or JSON backup into a separate recovery database, then deploy the prior application. Do not drop current collections.

MongoDB multi-document transactions require a replica set. Stage 1 avoids depending on them: capacity uses compare-and-swap with compensation, and organizer signup compensates a failed user insert. A rare crash between steps can leave a counter mismatch; rerunning migration recalculates it.

## Administrator bootstrap

Set `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, and a strong `ADMIN_BOOTSTRAP_PASSWORD` only in the operator shell, then run `npm run admin:bootstrap --workspace backend`. The CLI does not log the password and refuses duplicate accounts. Remove the variables afterward.
