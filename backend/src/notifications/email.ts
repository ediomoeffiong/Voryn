import nodemailer, { type Transporter } from "nodemailer";
import type { EmailContent } from "./templates.js";

export type EmailSendOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type EmailProviderStatus = {
  provider: "smtp" | "webhook" | "test_mock" | "not_configured";
  configured: boolean;
  senderAddress: string;
  details?: Record<string, unknown>;
};

export class EmailService {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private replyToAddress?: string;
  private webhookUrl?: string;
  private webhookToken?: string;
  public sentEmailsForTesting: Array<EmailSendOptions & { sentAt: Date }> = [];

  constructor() {
    this.fromAddress = process.env.EMAIL_FROM || "Voryn <no-reply@voryn.com>";
    this.replyToAddress = process.env.EMAIL_REPLY_TO || "support@voryn.com";
    this.webhookUrl = process.env.EMAIL_WEBHOOK_URL;
    this.webhookToken = process.env.EMAIL_WEBHOOK_TOKEN;

    const host = process.env.SMTP_HOST;
    if (host) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = process.env.SMTP_SECURE === "true" || port === 465;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined
      });
    }
  }

  getStatus(): EmailProviderStatus {
    if (this.transporter) {
      return {
        provider: "smtp",
        configured: true,
        senderAddress: this.fromAddress,
        details: { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || 587 }
      };
    }
    if (this.webhookUrl) {
      return {
        provider: "webhook",
        configured: true,
        senderAddress: this.fromAddress,
        details: { url: this.webhookUrl.replace(/\/\/[^@]*@/, "//") }
      };
    }
    if (process.env.NODE_ENV === "test") {
      return {
        provider: "test_mock",
        configured: true,
        senderAddress: this.fromAddress
      };
    }
    return {
      provider: "not_configured",
      configured: false,
      senderAddress: this.fromAddress
    };
  }

  async sendEmail(options: EmailSendOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const from = this.fromAddress;
    const replyTo = options.replyTo || this.replyToAddress;

    // 1. SMTP Transporter
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from,
          to: options.to,
          replyTo,
          subject: options.subject,
          html: options.html,
          text: options.text
        });
        return { success: true, messageId: info.messageId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `SMTP delivery failed: ${message}` };
      }
    }

    // 2. Webhook provider
    if (this.webhookUrl) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.webhookToken ? { Authorization: `Bearer ${this.webhookToken}` } : {})
          },
          body: JSON.stringify({
            from,
            to: options.to,
            replyTo,
            subject: options.subject,
            html: options.html,
            text: options.text
          })
        });

        if (!response.ok) {
          return { success: false, error: `Webhook returned HTTP ${response.status}: ${response.statusText}` };
        }
        return { success: true, messageId: `wh_${Date.now()}` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `Webhook delivery error: ${message}` };
      }
    }

    // 3. Test or unconfigured development mock mode
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV !== "production") {
      this.sentEmailsForTesting.push({ ...options, sentAt: new Date() });
      if (process.env.NODE_ENV !== "test") {
        console.info(`[Email Service Dev] Delivery to ${options.to}: ${options.subject}`);
      }
      return { success: true, messageId: `mock_${Date.now()}` };
    }

    return {
      success: false,
      error: "No email provider configured (configure SMTP_HOST or EMAIL_WEBHOOK_URL)"
    };
  }
}

export const emailService = new EmailService();
