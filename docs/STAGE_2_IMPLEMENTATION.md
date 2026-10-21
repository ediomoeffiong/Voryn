# Stage 2 — Event Creation and Lifecycle

Implementation date: 2026-10-21

## Architecture decisions

Stage 2 extends the Stage 1 React/TypeScript, Express, Prisma and MongoDB architecture. MongoDB remains authoritative; the synchronous discovery cache remains a read-through projection and now admits only public, published events. Stage 1 session cookies, CSRF protection, exact role checks, organizer membership and server-side event ownership middleware remain unchanged.

Event configuration that is always loaded and edited as one document (location, agenda, recurrence, registration settings, questions, FAQs, speakers and policies) is embedded as validated JSON on `Event`. Ticket inventory, uploaded media metadata and lifecycle audit entries are separate collections because they need independent counters, ownership, retention or query patterns. Prices use integer minor units. `priceLabel` remains display-only legacy metadata.

Every draft has a monotonically increasing `version`. Saves and lifecycle transitions use a version predicate in the database update, so a stale browser cannot overwrite a newer save. Draft validation is intentionally permissive; publication runs the complete domain validation contract.

Rich descriptions are sanitized server-side with an explicit tag, attribute, style and protocol allowlist. Meeting credentials are removed from public responses unless the requester owns the event, is an administrator, or has an active registration.

## Organizer workflow

The organizer portal uses one seven-step `EventBuilder` for creation and editing:

1. Basics: title, category, type, summary, sanitized rich description, tags, language, audience and visibility.
2. Schedule: time-zone-labelled start/end values and reorderable agenda items with track-overlap validation.
3. Location: physical, online or hybrid details for arbitrary countries/cities; joining information can be attendee-only.
4. Media: cover, hero, thumbnail, gallery ordering and trailer URL. File uploads are MIME- and signature-checked and stored outside MongoDB with randomized keys.
5. Tickets: registration modes, windows, event capacity, integer-minor-unit ticket tiers, sales windows, order limits, waitlist settings and typed custom questions.
6. Advanced: contact details, policies, age/accessibility settings, FAQs and reusable event speakers.
7. Preview: desktop, tablet and mobile widths, publication checklist and publishing.

Drafts autosave after 900 ms, expose saved/error/conflict states, support retry, recover from the organizer dashboard, and warn before closing a dirty page. The same editor loads complete existing values.

## Lifecycle and API behavior

Statuses are `draft`, `scheduled`, `published`, `cancelled`, `completed`, `archived` and `trashed`. Sold out is derived from capacity; the legacy `sold-out` value is accepted only during migration compatibility.

Organizer routes support versioned update, publish, schedule, unpublish, cancel, complete, archive, trash, restore, duplicate and guarded permanent deletion. Duplicate copies editable configuration and ticket definitions, resets inventory and counters, and never copies registrations, payments, check-ins or analytics. Events with registration history cannot be permanently deleted. Ticket types with reservations cannot be deleted or reduced below their reservation count.

Scheduled publication is executed by `POST /api/internal/publish-due` with `Authorization: Bearer $SCHEDULER_SECRET`. The worker selects due scheduled records and performs an idempotent status/version compare-and-swap. Configure an external deployment scheduler to call it at least every five minutes; it does not depend on an always-running process. A delayed call publishes missed executions safely.

Paid ticket tiers are fully configurable, but registration refuses every positive-price ticket and every `paid` registration mode until a verified payment adapter records payment. Revenue remains `null`; configured prices are never reported as earnings.

## Public integration and security

Public details render structured descriptions, agenda, speakers, tickets, FAQs, galleries and physical/online/hybrid facts. Draft, scheduled, archived and trashed records return 404 to non-owners. Cancelled/completed records remain reachable for historical context but are excluded from discovery. Unlisted published events work by direct URL and are excluded from discovery. Old slugs issue a permanent API redirect after an organizer changes a slug.

All event mutations retain Stage 1 authentication, CSRF, exact organizer membership and ownership checks. Input schemas are strict to block mass assignment. Media uploads enforce configurable byte limits, compare declared MIME to file signatures, use generated keys, reject traversal, and persist metadata in `MediaAsset`.

## Deployment configuration

- `DATABASE_URL`: MongoDB connection string.
- `SCHEDULER_SECRET`: long random bearer secret used only by the deployment scheduler.
- `MEDIA_STORAGE_DIR`: persistent writable storage directory. The default `.voryn-media` is suitable for local development only.
- `MEDIA_PUBLIC_BASE_URL`: optional public base for a durable object-storage/CDN adapter. When absent, media is served by the API.
- `MEDIA_MAX_BYTES`: optional upload limit; default 15 MiB.
- Existing Stage 1 `CORS_ORIGIN`, cookie, session and email settings remain required as documented in Stage 1.

## Current boundaries

The data model and recurrence rule/exception contract are present, but occurrence expansion and exception editing are deferred. The local filesystem media adapter requires a persistent disk in production; object storage should set `MEDIA_PUBLIC_BASE_URL` and replace the write adapter before horizontally scaling. Paystack/other checkout, refunds, financial ledgers, notification delivery, geocoding/maps and collaborator invitation/permission UI remain separate stages. The organizer event list provides search, status/category/date filters, sorting, pagination and list/card views; the full Stage 3 dashboard analytics overhaul is intentionally not included.

