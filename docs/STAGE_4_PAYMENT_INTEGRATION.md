# VORYN — STAGE 4 PAYMENT INTEGRATION GUIDE
## Secure Paystack Implementation, Webhook Processing, and Financial Settlement

---

## 1. Architecture & Provider Abstraction

Voryn implements a clean payment provider abstraction to decouple business operations (ticket checkout, inventory reservations, order management, ledger reconciliation) from gateway-specific APIs.

### 1.1 Interface Definition (`backend/src/payments/types.ts`)

```typescript
export interface PaymentProvider {
  name: string;
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean;
  parseWebhookPayload(payload: unknown): WebhookEventPayload;
  initiateRefund(params: InitiateRefundParams): Promise<InitiateRefundResult>;
}
```

This interface guarantees that future gateways (such as Stripe or Flutterwave) can be added seamlessly by implementing this contract and configuring provider selection.

---

## 2. Paystack Integration Implementation

### 2.1 Initialization Flow (`PaystackProvider.initializePayment`)
1. **Endpoint:** `POST https://api.paystack.co/transaction/initialize`
2. **Parameters:**
   - `email`: Authenticated attendee's email address.
   - `amount`: Total amount in **integer minor currency units** (e.g. `NGN 5,000` = `500000` kobo).
   - `currency`: Primary commercial currency (`NGN`).
   - `reference`: Cryptographically unique internal reference (`VRY-ord-xxxx`).
   - `callback_url`: Return URL (`https://voryn.com/checkout/callback`).
   - `metadata`: Contains internal `orderId`, `orderNumber`, `eventId`, and custom fields.
3. **Response:** Returns Paystack `authorization_url`, `access_code`, and `reference`.

### 2.2 Server-Side Transaction Verification (`PaystackProvider.verifyTransaction`)
1. **Endpoint:** `GET https://api.paystack.co/transaction/verify/:reference`
2. **Security Checks:**
   - Verifies HTTP 200 response from Paystack.
   - Confirms `data.status === "success"`.
   - Compares returned `amount` (minor units) with the expected `totalMinor` stored in `TicketOrder`.
   - Compares returned `currency` with the order `currency`.
   - Protects against duplicate processing by checking if order status is already `paid`.

---

## 3. Webhook Security & Idempotency

### 3.1 Raw Request Body Preservation
Paystack generates an HMAC-SHA512 signature using the merchant's secret key and the **exact raw request body**. Standard JSON body parsers alter whitespace, which breaks signature verification. In `backend/src/server.ts`, Express JSON parser preserves the raw buffer:

```typescript
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    }
  })
);
```

### 3.2 Signature Verification
The webhook handler verifies the `x-paystack-signature` header using Node's constant-time comparison to prevent timing attacks:

```typescript
verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  if (!this.webhookSecret || !signature) return false;
  const hash = crypto.createHmac("sha512", this.webhookSecret).update(rawBody).digest("hex");
  const hashBuf = Buffer.from(hash, "hex");
  const sigBuf = Buffer.from(signature, "hex");
  if (hashBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, sigBuf);
}
```

### 3.3 CSRF Exemption
Webhooks originate from Paystack servers without session cookies. In `backend/src/auth.ts`, `/api/payments/webhook` is explicitly exempted from CSRF verification.

### 3.4 Duplicate Prevention (`PaymentWebhookEvent`)
Every received webhook event is recorded in the `PaymentWebhookEvent` table with its unique event ID (`eventId`). If an event with the same ID has already been recorded and processed, the handler acknowledges the request (`HTTP 200 { received: true, duplicate: true }`) without re-processing tickets, ledger entries, or emails.

---

## 4. Inventory Reservation & Race Condition Prevention

To prevent overselling tickets when multiple attendees attempt to purchase limited tickets simultaneously:

1. **Reservation Hold:** When checkout initializes, `InventoryReservation` records are written with `status: "active"` and an expiration timestamp (15 minutes).
2. **Atomic Availability Calculation:** Available tickets are computed as:
   $$\text{Available} = \text{Capacity} - (\text{Sold Tickets} + \text{Active Unexpired Reservations})$$
3. **Checkout Validation:** If requested quantity exceeds available capacity, checkout is rejected before any payment is initialized.
4. **Order Confirmation:** When payment is verified (via callback or webhook), reservations are transitioned to `status: "fulfilled"`, and permanent `Ticket` and `Registration` records are issued.
5. **Worker Expiration Cleanup:** The background worker periodically queries reservations where `expiresAt < now` and `status === "active"`, transitioning them to `expired` to free inventory for other users.
6. **Late Payment Handling:** If payment succeeds after the reservation expired and tickets were claimed by another buyer, the payment service marks the order as requiring manual reconciliation or initiates an automatic refund rather than overselling.

---

## 5. Refund Architecture & Financial Ledger

### 5.1 Refund Workflow
1. **Attendee Request:** Participant submits a refund request via `/api/payments/refunds/request` with a reason. A `Refund` record is created in `requested` status.
2. **Organizer Review:** Organizer inspects requests in the dashboard (`/organizer/revenue`) and chooses **Approve** or **Reject**.
3. **Provider Execution:** When approved, `paymentService.decideRefund` invokes `paystack.initiateRefund`.
4. **Settlement Update:** Once confirmed by the gateway, the order status transitions to `refunded` or `partially_refunded`, ticket statuses are set to `revoked`, and double-entry ledger entries are recorded.

### 5.2 Financial Ledger Entries (`FinancialLedgerEntry`)
All monetary movements are tracked as immutable double-entry ledger records:
- **Sale:** `type: "sale"`, `direction: "credit"`, recording gross sales, platform/gateway fees, and net settlement.
- **Refund:** `type: "refund"`, `direction: "debit"`, recording the reversed amount.
- **Revenue Calculation:** Organizer and platform revenue metrics query verified `FinancialLedgerEntry` records rather than guessing revenue from RSVP counts or unverified bookings.

---

## 6. Environment Variables Reference

| Variable | Required in Production | Description |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Yes (Live) | Paystack secret API key (`sk_live_...` or `sk_test_...`) |
| `PAYSTACK_PUBLIC_KEY` | Yes | Paystack public key for client integration |
| `PAYSTACK_WEBHOOK_SECRET` | Yes (Live) | Secret key used to verify HMAC-SHA512 webhook signatures |
| `APP_BASE_URL` | Yes | Canonical base URL (e.g. `https://voryn.com`) for callback redirects |
