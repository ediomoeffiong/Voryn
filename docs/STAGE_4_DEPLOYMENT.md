# VORYN — STAGE 4 DEPLOYMENT & PRODUCTION READINESS
## Deployment Architecture, Process Model, Environment Configuration & Operational Readiness

---

## 1. Production Architecture & Process Model

Voryn operates as a modern two-process architecture with an optional standalone background worker:

1. **Web API Service (`backend`):**
   - Express server handling HTTP requests, CSRF validation, session cookies, Paystack webhooks, search queries, and SEO assets (`/sitemap.xml`, `/robots.txt`).
   - Command: `npm start --workspace backend` (or `node backend/dist/server.js`)

2. **Background Worker Service (`worker`):**
   - In production environments (e.g. Render, Railway, AWS ECS, Fly.io), the worker can run as an independent background worker service to prevent compute-intensive jobs from impacting HTTP response latencies.
   - Command: `node backend/dist/worker.js`
   - *Note:* In single-instance or dev mode, the web server can also spawn the worker process in-process when `START_WORKER_IN_PROCESS=true`.

3. **Frontend Client Application (`frontend`):**
   - Static single-page application compiled via Vite.
   - Hosted on static file hosts (Render Static Sites, Vercel, Netlify, Cloudflare Pages, AWS S3/CloudFront).
   - Command to build: `npm run build --workspace frontend`

---

## 2. Environment Variables Specification

### 2.1 Backend Environment Variables

| Variable | Type | Required | Description | Example |
|---|---|---|---|---|
| `NODE_ENV` | String | Yes | Environment mode | `production` |
| `PORT` | Number | Yes | Port for Express HTTP server | `4000` |
| `DATABASE_URL` | String | Yes | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/voryn?retryWrites=true&w=majority` |
| `SESSION_SECRET` | String | Yes | 32+ char secret for session cookies | `random_cryptographic_key_32_chars` |
| `APP_BASE_URL` | String | Yes | Public URL of frontend app | `https://voryn.com` |
| `API_BASE_URL` | String | Yes | Public URL of backend API | `https://api.voryn.com` |
| `PAYSTACK_SECRET_KEY` | String | Yes | Paystack live API secret key | `sk_live_xxxx` |
| `PAYSTACK_PUBLIC_KEY` | String | Yes | Paystack live API public key | `pk_live_xxxx` |
| `PAYSTACK_WEBHOOK_SECRET`| String | Yes | Secret used for webhook signature verification | `sk_live_xxxx` |
| `SMTP_HOST` | String | Yes | Production SMTP server host | `smtp.sendgrid.net` or `smtp.postmarkapp.com` |
| `SMTP_PORT` | Number | Yes | SMTP port (typically 587 or 465) | `587` |
| `SMTP_USER` | String | Yes | SMTP username | `apikey` |
| `SMTP_PASS` | String | Yes | SMTP password | `SG.xxxx` |
| `SMTP_FROM` | String | Yes | Default sender address | `"Voryn" <noreply@voryn.com>` |
| `SMTP_SECURE` | Boolean| No | Use SSL/TLS directly (port 465) | `false` |
| `START_WORKER_IN_PROCESS` | Boolean | No | Run worker inside web process | `false` (recommended in prod) |

### 2.2 Frontend Environment Variables

| Variable | Type | Required | Description | Example |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | String | Yes | Target backend API URL | `https://api.voryn.com` |
| `VITE_PAYSTACK_PUBLIC_KEY` | String | No | Paystack public key if needed | `pk_live_xxxx` |

---

## 3. Database Deployment & Prisma Generation

1. **MongoDB Atlas Replica Set:**
   - MongoDB 5.0+ with replica set enabled (required for Prisma transactions).
   - Ensure IP access lists allow inbound connections from Render / hosting platform IP ranges (`0.0.0.0/0` with strong authentication).
2. **Prisma Client Generation:**
   ```bash
   npx prisma generate --schema=backend/prisma/schema.prisma
   ```
   *Note: This is automatically executed during the production build script (`npm run build`).*

---

## 4. Production Build & Deployment Pipeline

### 4.1 Build Step
```bash
npm install
npm run build
```
The root `npm run build` runs:
1. `npm run build --workspace backend`: runs `prisma generate` and compiles TypeScript to `backend/dist`.
2. `npm run build --workspace frontend`: executes TypeScript verification and Vite compilation to `frontend/dist`.

### 4.2 Start Commands
- **Web Service:** `node backend/dist/server.js`
- **Background Worker:** `node backend/dist/worker.js`

---

## 5. Domain, DNS & Paystack Configuration

1. **Custom Domain:**
   - Configure DNS CNAME pointing to hosting platform (e.g. `voryn.com`).
   - Configure SSL/TLS certificate (automated via Let's Encrypt on Render/Cloudflare).
2. **Paystack Dashboard Webhook Setup:**
   - Navigate to **Paystack Dashboard -> Settings -> API Keys & Webhooks**.
   - Set **Live Webhook URL** to `https://api.voryn.com/api/payments/webhook`.
   - Copy the secret key into `PAYSTACK_WEBHOOK_SECRET`.
   - Send test webhook event to verify receipt and HMAC verification.
3. **Email Domain Authentication:**
   - Configure SPF, DKIM, and DMARC records on the domain DNS to maximize inbox delivery rates for transaction confirmations and reminders.
