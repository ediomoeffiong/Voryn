# Voryn

Voryn is a React 19 event-discovery frontend and an Express/TypeScript API backed by MongoDB through Prisma.

## Local setup

1. Copy `.env.example` values into your local environment; never commit secrets.
2. Set `DATABASE_URL` to a development MongoDB database and `CORS_ORIGIN=http://localhost:5173`.
3. Follow `docs/STAGE_1_MIGRATION.md` before applying schema changes to an existing database.
4. Run `npm install`, then `npm run dev`.

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000`

Liveness: `GET /api/health`

Readiness: `GET /api/ready`

## Security and operations

Authentication uses expiring database sessions and HttpOnly cookies; the browser never stores reusable credentials. Production requires explicit `CORS_ORIGIN` values. Cross-site deployment requires HTTPS, `COOKIE_SAME_SITE=none`, an appropriate `COOKIE_DOMAIN`, and the CSRF header/cookie flow. Password reset returns 503 until `EMAIL_WEBHOOK_URL` is configured.

Public admin registration does not exist. Provision an initial admin only with the documented CLI. Development fixtures are imported only when `ENABLE_DEMO_SEED=true` outside production and never include user passwords.

```bash
npm run typecheck
npm test
npm run build
```

See `docs/STAGE_1_AUDIT.md`, `docs/STAGE_1_MIGRATION.md`, and `docs/STAGE_1_TEST_RESULTS.md` for the repair record and remaining configuration-dependent checks.
