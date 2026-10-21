# Stage 1 Audit

Audit date: 2026-10-21

## Confirmed findings and resolutions

| Finding | Evidence before repair | Resolution |
|---|---|---|
| Plaintext credentials | `portal.ts` seeded and compared the literal `password`; `User.password` stored it. | Node's maintained `scrypt` KDF with random salts; the mapped database field now exposes only `passwordHash`. Legacy non-hash values are never authenticated and are marked for reset. |
| Public administrator creation | `POST /api/admin/auth/signup` created an admin without privilege. | Endpoint returns 404. An explicit environment-driven CLI with `--confirm` is the only bootstrap path. |
| Demo secrets exposed | Login fields and help text displayed three known accounts and `password`. | Prefills and credential text removed. Production never auto-seeds users. |
| Reusable bearer tokens | Predictable `Math.random` tokens lived in a Map, JSON, MongoDB, and browser `localStorage`. | Random 256-bit tokens are sent only in HttpOnly cookies; only SHA-256 token hashes are stored with expiry; logout revokes the record. |
| Role overlap | `requireRole` treated participant and organizer as interchangeable and gave admins implicit access. | Exact centralized role middleware. Organizers explicitly receive participant features; participants never receive organizer features; admins receive only admin routes. |
| Implicit organizer ownership | `organizerFor()` created missing profiles and fell back to `organizers[0]`, including for admins. | Missing membership/profile is an explicit 403/409; event ownership is checked server-side by organizer slug. |
| Unawaited persistence | Core writes used `.catch(...)` and returned success first. | Request-critical writes are awaited. Cache updates occur only after MongoDB success. Errors reach centralized safe handling. |
| Three authoritative stores | Mutable fixtures, `portal-store.json`, and MongoDB were mutated independently. | MongoDB is authoritative. JSON persistence and mutable user/session arrays were removed. Event/city arrays are a read-through discovery cache hydrated from MongoDB at startup. |
| Anonymous RSVP counter mutation | Public RSVP incremented three counters without a user or registration. | Both RSVP endpoints require an authenticated participant-capable account and call the canonical registration service. |
| Inconsistent statistics/revenue | RSVP, attendee, ticket, and price-label-derived revenue were conflated. | Registration count comes from active records; capacity uses an atomic reservation counter; check-ins/ticket sales are not invented; revenue and conversion report `null`/“Not configured”. |
| Unsafe registration/deletion | No unique key, ownership-safe cancellation, capacity CAS, or registration-aware deletion. | Unique `(userId,eventSlug)`, owner-scoped cancellation with history, atomic capacity reservation, and soft deletion blocked while active registrations exist. |
| Database startup masked failure | `initDb()` caught errors and the API still listened. | Startup fails closed, performs a MongoDB ping, exposes separate `/api/health` and `/api/ready`, and disconnects gracefully. |
| Draft leakage and misleading edit | Public arrays included every non-draft status and Edit toggled publication state. | Draft detail access is owner/admin-only; Edit now opens and saves the basic event form. |
| Weak request/security boundary | Duplicated CORS, no CSRF/Helmet/body limit/rate limit, ad-hoc validation. | Credentialed allowlist CORS, Helmet, CSRF, 1 MiB body limit, login/reset throttling, Zod schemas, and centralized errors. |

MongoDB is the production source of truth. The legacy synchronous discovery algorithms consume a read cache hydrated only after a successful database connection and updated only after confirmed event writes. The schema retains legacy collection and password field names through Prisma mapping. No collection is dropped and no user/event/registration is automatically deleted.
