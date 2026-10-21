# Stage 2 Test Results

Execution date: 2026-10-21

## Executed checks

| Command | Result |
|---|---|
| `npm run typecheck` | Passed: backend and frontend TypeScript checks. |
| `npm test` | Passed: 3 files, 11 tests. |
| `npm run build` | Passed: Prisma generation, backend compilation and Vite production build (1,593 modules). |
| `npm run migrate:stage2:dry-run --workspace backend` | Passed against configured local MongoDB; 0 conflicts. |
| `npx prisma db push` from `backend/` | Passed; collections and indexes synchronized without reset. |

The automated Stage 2 tests cover incomplete draft validation, publication requirements, session overlap detection, ticket minor-unit/order validation and rich-text XSS sanitization. Existing Stage 1 tests continue to cover credential hashing, public admin-signup removal, authentication boundaries and CSRF rejection.

## Security and integrity assertions exercised

- Draft schemas accept incomplete data while strict schemas reject unknown/invalid structured values.
- Publication rejects missing schedule/location/tickets.
- Same-track schedule overlap is rejected.
- Ticket prices must be integer minor units and order limits must be coherent.
- Script elements, event-handler attributes and `javascript:` URLs are removed from rich HTML.
- Organizer and participant mutations remain inaccessible without authentication.
- State-changing requests remain inaccessible without CSRF.

## Remaining test work

The repository does not yet include a browser E2E harness or a disposable MongoDB integration-test container. Consequently drag/drop interaction, visual viewport regression, concurrent real-database writers, scheduler retry against a replica set, and complete lifecycle sequences were verified by type/build contracts and code review rather than automated E2E. Add Playwright plus an isolated MongoDB replica-set fixture before treating those paths as release-gating automated coverage.

