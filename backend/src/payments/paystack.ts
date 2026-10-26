import crypto from "node:crypto";
import { HttpError } from "../http.js";
import { prisma } from "../db.js";
import type {
  Currency,
  InitializePaymentParams,
  InitializePaymentResult,
  InitiateRefundParams,
  InitiateRefundResult,
  PaymentProvider,
  RefundStatusResult,
  VerifyTransactionResult
} from "./types.js";

export class PaystackProvider implements PaymentProvider {
  name = "paystack";
  private secretKey: string;
  private webhookSecret: string;
  private baseUrl = "https://api.paystack.co";

  constructor(secretKey = process.env.PAYSTACK_SECRET_KEY, webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET) {
    this.secretKey = secretKey ?? "";
    this.webhookSecret = webhookSecret || this.secretKey;
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey && this.secretKey.startsWith("sk_"));
  }

  private isMockMode(): boolean {
    return (
      !this.isConfigured() ||
      this.secretKey.startsWith("sk_test_mock_") ||
      (process.env.NODE_ENV === "test" && process.env.PAYSTACK_LIVE_TEST !== "true")
    );
  }

  private getHeaders(): Record<string, string> {
    if (!this.isConfigured() && process.env.NODE_ENV !== "test") {
      throw new HttpError(503, "Paystack payment gateway is not configured");
    }
    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Voryn-Payment-Engine/1.0"
    };
  }

  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    // If in test/mock mode, return simulated authorization
    if (this.isMockMode()) {
      return {
        authorizationUrl: `https://checkout.paystack.com/test-mock-${params.reference}`,
        accessCode: `test_access_${params.reference}`,
        reference: params.reference
      };
    }

    const payload = {
      email: params.customerEmail,
      amount: Math.round(params.amountMinor),
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: {
        ...params.metadata,
        orderNumber: params.orderNumber,
        customerName: params.customerName
      }
    };

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: {
        authorization_url: string;
        access_code: string;
        reference: string;
      };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new HttpError(502, `Paystack initialization failed: ${data.message || response.statusText}`);
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference
    };
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    if (this.isMockMode()) {
      let mockAmount = 100000;
      let mockCurrency = "NGN";
      let mockEmail = "tester@example.com";
      try {
        const order = await prisma.ticketOrder.findFirst({
          where: { paymentReference: reference }
        });
        if (order) {
          mockAmount = order.totalMinor;
          mockCurrency = order.currency;
          mockEmail = order.customerEmail;
        }
      } catch {
        // Fallback to default mock amount
      }
      return {
        status: "success",
        reference,
        providerReference: `pstk_${reference}`,
        amountMinor: mockAmount,
        currency: mockCurrency,
        customerEmail: mockEmail,
        channel: "card",
        gatewayResponse: "Successful (Test Mode)",
        paidAt: new Date(),
        feesMinor: Math.round(mockAmount * 0.015),
        rawPayload: { test: true, reference, status: "success", amount: mockAmount }
      };
    }

    const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: this.getHeaders()
    });

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: {
        status: string;
        reference: string;
        id?: number;
        amount: number;
        currency: string;
        channel?: string;
        gateway_response?: string;
        paid_at?: string;
        fees?: number;
        customer?: { email: string };
        [key: string]: unknown;
      };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new HttpError(502, `Paystack verification failed: ${data.message || response.statusText}`);
    }

    const transaction = data.data;
    let mappedStatus: VerifyTransactionResult["status"] = "failed";
    if (transaction.status === "success") mappedStatus = "success";
    else if (transaction.status === "abandoned") mappedStatus = "abandoned";
    else if (transaction.status === "ongoing" || transaction.status === "pending") mappedStatus = "pending";

    return {
      status: mappedStatus,
      reference: transaction.reference,
      providerReference: transaction.id ? String(transaction.id) : undefined,
      amountMinor: transaction.amount,
      currency: transaction.currency,
      customerEmail: transaction.customer?.email ?? "",
      channel: transaction.channel,
      gatewayResponse: transaction.gateway_response,
      paidAt: transaction.paid_at ? new Date(transaction.paid_at) : undefined,
      feesMinor: transaction.fees,
      rawPayload: transaction as Record<string, unknown>
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature || !rawBody) return false;
    const secret = this.webhookSecret;
    if (!secret) return false;

    try {
      const hmac = crypto.createHmac("sha512", secret);
      hmac.update(rawBody);
      const computed = hmac.digest("hex");

      const signatureBuffer = Buffer.from(signature, "hex");
      const computedBuffer = Buffer.from(computed, "hex");

      if (signatureBuffer.length !== computedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawBody: string | Buffer): {
    eventId: string;
    eventType: string;
    data: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
  } {
    const stringBody = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const parsed = JSON.parse(stringBody) as {
      event: string;
      data: Record<string, unknown>;
      id?: string | number;
    };

    const eventId = String(parsed.id || parsed.data?.id || crypto.createHash("sha256").update(stringBody).digest("hex"));
    return {
      eventId,
      eventType: parsed.event,
      data: parsed.data || {},
      rawPayload: parsed as Record<string, unknown>
    };
  }

  async initiateRefund(params: InitiateRefundParams): Promise<InitiateRefundResult> {
    if (this.isMockMode()) {
      return {
        refundId: `rfnd_mock_${Date.now()}`,
        status: "pending",
        amountMinor: params.amountMinor ?? 0,
        currency: params.currency ?? "NGN",
        rawPayload: { mock: true }
      };
    }

    const payload: Record<string, unknown> = {
      transaction: params.transactionReference
    };
    if (params.amountMinor) payload.amount = params.amountMinor;
    if (params.currency) payload.currency = params.currency;
    if (params.customerNote) payload.customer_note = params.customerNote;
    if (params.merchantNote) payload.merchant_note = params.merchantNote;

    const response = await fetch(`${this.baseUrl}/refund`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: {
        id: number | string;
        status: string;
        amount: number;
        currency: string;
        [key: string]: unknown;
      };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new HttpError(502, `Paystack refund initiation failed: ${data.message || response.statusText}`);
    }

    const refund = data.data;
    let mappedStatus: InitiateRefundResult["status"] = "pending";
    if (refund.status === "processed" || refund.status === "success") mappedStatus = "completed";
    else if (refund.status === "failed") mappedStatus = "failed";
    else if (refund.status === "processing") mappedStatus = "processing";

    return {
      refundId: String(refund.id),
      status: mappedStatus,
      amountMinor: refund.amount,
      currency: refund.currency,
      rawPayload: refund as Record<string, unknown>
    };
  }

  async getRefundStatus(refundId: string): Promise<RefundStatusResult> {
    if (this.isMockMode()) {
      return {
        refundId,
        status: "completed",
        amountMinor: 100000,
        currency: "NGN",
        rawPayload: { mock: true, status: "completed" }
      };
    }

    const response = await fetch(`${this.baseUrl}/refund/${encodeURIComponent(refundId)}`, {
      method: "GET",
      headers: this.getHeaders()
    });

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: {
        id: number | string;
        status: string;
        amount: number;
        currency: string;
        [key: string]: unknown;
      };
    };

    if (!response.ok || !data.status || !data.data) {
      throw new HttpError(502, `Failed to retrieve refund status: ${data.message || response.statusText}`);
    }

    const refund = data.data;
    let mappedStatus: RefundStatusResult["status"] = "pending";
    if (refund.status === "processed" || refund.status === "success") mappedStatus = "completed";
    else if (refund.status === "failed") mappedStatus = "failed";
    else if (refund.status === "processing") mappedStatus = "processing";

    return {
      refundId: String(refund.id),
      status: mappedStatus,
      amountMinor: refund.amount,
      currency: refund.currency,
      rawPayload: refund as Record<string, unknown>
    };
  }
}

export const defaultPaymentProvider = new PaystackProvider();
