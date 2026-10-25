export type Currency = "NGN" | "USD" | "GBP" | "EUR";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "cancelled"
  | "expired"
  | "failed"
  | "partially_refunded"
  | "refunded";

export type OrderStatus = PaymentStatus;

export type InitializePaymentParams = {
  reference: string;
  orderNumber: string;
  amountMinor: number;
  currency: Currency;
  customerEmail: string;
  customerName: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type InitializePaymentResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type VerifyTransactionResult = {
  status: "success" | "failed" | "abandoned" | "pending";
  reference: string;
  providerReference?: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  channel?: string;
  gatewayResponse?: string;
  paidAt?: Date;
  feesMinor?: number;
  rawPayload: Record<string, unknown>;
};

export type InitiateRefundParams = {
  transactionReference: string;
  amountMinor?: number;
  currency?: string;
  merchantNote?: string;
  customerNote?: string;
};

export type InitiateRefundResult = {
  refundId: string;
  status: "pending" | "processing" | "completed" | "failed";
  amountMinor: number;
  currency: string;
  rawPayload: Record<string, unknown>;
};

export type RefundStatusResult = {
  refundId: string;
  status: "pending" | "processing" | "completed" | "failed";
  amountMinor: number;
  currency: string;
  rawPayload: Record<string, unknown>;
};

export interface PaymentProvider {
  name: string;
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyTransaction(reference: string): Promise<VerifyTransactionResult>;
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean;
  parseWebhookEvent(rawBody: string | Buffer): {
    eventId: string;
    eventType: string;
    data: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
  };
  initiateRefund(params: InitiateRefundParams): Promise<InitiateRefundResult>;
  getRefundStatus(refundId: string): Promise<RefundStatusResult>;
}
