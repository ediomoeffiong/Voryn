# VORYN — STAGE 4 NOTIFICATIONS & BACKGROUND WORKER
## Automated Transactional Emails, Background Job Queue, and Event Reminder Engine

---

## 1. Overview

Voryn's notification architecture ensures reliable, asynchronous delivery of critical transactional communications (ticket purchases, receipts, refund notifications, password resets) and automated lifecycle reminders (7 days, 1 day, 1 hour before an event).

---

## 2. Notification Subsystem Components

```
                   ┌─────────────────────────────────────────┐
                   │        Application / API Server         │
                   └────────────────────┬────────────────────┘
                                        │ Dispatches Job
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │    BackgroundJob Queue (MongoDB)        │
                   │  - type: "send_email", "webhook", etc.  │
                   │  - status: "pending", "processing"      │
                   │  - scheduledFor: ISODate                │
                   └────────────────────┬────────────────────┘
                                        │ Polls every 5s
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │            Background Worker            │
                   │           (backend/src/worker.ts)       │
                   └──────────┬───────────────────┬──────────┘
                              │                   │
                  Processes Jobs                  Scans Reminders
                              │                   │
                              ▼                   ▼
                   ┌─────────────────────┐   ┌───────────────────────┐
                   │    EmailService     │   │ Registration Scanner  │
                   │ (Nodemailer / SMTP) │   │ (7d, 1d, 1h offsets)  │
                   └─────────────────────┘   └───────────────────────┘
```

---

## 3. Email Templates (`backend/src/notifications/templates.ts`)

All email templates produce responsive HTML with embedded CSS styling and matching plain-text fallbacks:

1. **Ticket Purchase Confirmation (`ticketPurchaseEmail`):**
   - Event title, venue, and start time.
   - Purchased ticket tier, quantity, and total paid.
   - Admission codes and display references.
   - Direct link to access the attendee's digital wallet and QR codes.

2. **Payment Receipt (`paymentReceiptEmail`):**
   - Order number and Paystack transaction reference.
   - Itemized purchase breakdown with prices.
   - Payment method, channel, currency, and timestamp.
   - Downloadable receipt access.

3. **Refund Status Notification (`refundStatusEmail`):**
   - Order number, refunded amount, and currency.
   - Decision outcome (`approved` / `rejected`).
   - Organizer or administrative notes explaining the decision.

4. **Event Lifecycle Reminders (`eventReminderEmail`):**
   - Dynamic timing offset headline (e.g., *"Starts in 1 hour"*, *"Starts tomorrow"*, *"Starts in 7 days"*).
   - Venue address, directions, and calendar links (Google, Outlook, Apple ICS).
   - Door check-in instructions and ticket codes for rapid admission.

5. **Security & Identity Emails (`passwordResetEmail`):**
   - Cryptographically random reset token link with expiration notice.
   - IP address / security disclaimer.

---

## 4. Delivery Engine (`backend/src/notifications/email.ts`)

The `EmailService` implements three delivery tiers:

1. **SMTP Transport (Production):**
   - Powered by `nodemailer`.
   - Configurable host, port, authentication, and TLS options.
   - Verified on startup using `transporter.verify()`.

2. **Webhook Fallback:**
   - If an external HTTP email gateway webhook is configured (`EMAIL_WEBHOOK_URL`), requests are dispatched via HTTP POST with JSON payloads.

3. **Development / Test Mode:**
   - When running in `NODE_ENV === "test"` or when SMTP credentials are not present, sent emails are recorded in an in-memory queue (`emailService.sentEmailsForTesting`).
   - System health reports `email.configured === true` or provides an informative status string.

---

## 5. Durable Background Job Queue (`backend/src/notifications/queue.ts`)

### 5.1 Retry Policy & Exponential Backoff
Failed jobs are retried up to `maxAttempts` (default: 5) using an exponential backoff progression:

$$\text{Delay} = [10\text{s}, 60\text{s}, 300\text{s}, 1800\text{s}, 3600\text{s}]$$

When `attempts >= maxAttempts`, the job is marked as `exhausted` (dead-letter queue) and recorded in the audit log for administrative review.

### 5.2 Scheduled Execution
Jobs can specify `scheduledFor`. The worker only claims jobs where `scheduledFor <= new Date()`.

---

## 6. Worker Process & Reminder Scanner (`backend/src/worker.ts`)

The worker runs in a separate thread or background process:

1. **Job Loop:** Polls every 5 seconds for pending background jobs, updates status to `processing`, executes the payload handler, and marks `completed` or reschedules on error.
2. **Upcoming Reminder Scanner:** Runs every 60 seconds:
   - Scans upcoming published events starting within 7 days, 24 hours, 1 hour, or now.
   - Queries confirmed attendees.
   - Enqueues reminder jobs with unique idempotency keys (`reminder:<eventId>:<userId>:<offset>`) to guarantee an attendee never receives duplicate reminder emails for the same interval.
3. **Reservation Expiration Loop:** Runs every 60 seconds to release inventory holds from expired checkout sessions.
4. **Graceful Shutdown:** Intercepts `SIGINT` and `SIGTERM` to finish currently processing jobs before exiting cleanly.
