import crypto from "node:crypto";
import { Prisma, type Event as DbEvent, type TicketType, type User } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import { createTicketCode, hashToken } from "../security.js";
import { defaultPaymentProvider } from "./paystack.js";
import type { Currency, PaymentProvider } from "./types.js";
import { enqueueEmail, enqueueJob } from "../notifications/queue.js";
import { paymentReceiptEmail, refundStatusEmail, ticketPurchaseEmail } from "../notifications/templates.js";
import { writeAudit } from "../audit.js";
import type { Request } from "express";

export class PaymentService {
  constructor(private provider: PaymentProvider = defaultPaymentProvider) {}

  async createOrderAndInitializePayment(
    user: User,
    eventSlug: string,
    items: Array<{ ticketTypeId: string; quantity: number }>,
    callbackUrl?: string
  ) {
    if (!items || items.length === 0) {
      throw new HttpError(422, "At least one ticket type must be selected");
    }

    const event = await prisma.event.findUnique({ where: { slug: eventSlug } });
    if (!event || event.deletedAt) {
      throw new HttpError(404, "Event not found");
    }
    if (event.status !== "published") {
      throw new HttpError(409, "Event is not open for ticket purchase");
    }

    const now = new Date();
    const ticketTypeIds = items.map((i) => i.ticketTypeId);
    const dbTicketTypes = await prisma.ticketType.findMany({
      where: {
        eventId: event.id,
        OR: [
          { id: { in: ticketTypeIds } },
          { name: { in: ticketTypeIds } }
        ]
      }
    });

    const ticketMap = new Map<string, TicketType>();
    for (const t of dbTicketTypes) {
      ticketMap.set(t.id, t);
      ticketMap.set(t.name, t);
    }
    let subtotalMinor = 0;
    let totalQuantity = 0;
    let currency: Currency = "NGN";

    const validatedOrderItems: Array<{
      ticketType: TicketType;
      quantity: number;
      unitPriceMinor: number;
      subtotalMinor: number;
    }> = [];

    for (const item of items) {
      const ticket = ticketMap.get(item.ticketTypeId);
      if (!ticket) {
        throw new HttpError(422, `Invalid ticket type: ${item.ticketTypeId}`);
      }
      const qty = Math.max(1, Math.min(Number(item.quantity || 1), 100));
      if (qty < ticket.minPerOrder || qty > ticket.maxPerOrder) {
        throw new HttpError(422, `Quantity for ${ticket.name} must be between ${ticket.minPerOrder} and ${ticket.maxPerOrder}`);
      }
      if (ticket.salesOpenAt && now < ticket.salesOpenAt) {
        throw new HttpError(409, `Sales for ${ticket.name} have not opened yet`);
      }
      if (ticket.salesCloseAt && now > ticket.salesCloseAt) {
        throw new HttpError(409, `Sales for ${ticket.name} have closed`);
      }
      if (ticket.capacity !== null && ticket.reservedCount + qty > ticket.capacity) {
        throw new HttpError(409, `Ticket capacity for ${ticket.name} has been reached`);
      }

      currency = (ticket.currency as Currency) || "NGN";
      const itemSubtotal = ticket.priceMinor * qty;
      subtotalMinor += itemSubtotal;
      totalQuantity += qty;

      validatedOrderItems.push({
        ticketType: ticket,
        quantity: qty,
        unitPriceMinor: ticket.priceMinor,
        subtotalMinor: itemSubtotal
      });
    }

    if (subtotalMinor <= 0) {
      throw new HttpError(400, "For free tickets, please use the free RSVP registration workflow");
    }

    if (event.capacity !== null && event.reservedCount + totalQuantity > event.capacity) {
      throw new HttpError(409, "Event total capacity has been reached");
    }

    // Atomic inventory reservation
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes reservation
    const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;
    const paymentReference = `VRY-${orderNumber}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    // Perform atomic capacity updates with optimistic retry
    let reserved = false;
    for (let attempt = 0; attempt < 5 && !reserved; attempt++) {
      const currentEvent = await prisma.event.findUnique({ where: { id: event.id } });
      if (!currentEvent || currentEvent.deletedAt || currentEvent.status !== "published") {
        throw new HttpError(409, "Event is no longer open for ticket purchase");
      }
      if (currentEvent.capacity !== null && currentEvent.reservedCount + totalQuantity > currentEvent.capacity) {
        throw new HttpError(409, "Event total capacity has been reached");
      }
      const eventUpdate = await prisma.event.updateMany({
        where: {
          id: event.id,
          status: "published",
          deletedAt: null,
          reservedCount: currentEvent.reservedCount
        },
        data: {
          reservedCount: { increment: totalQuantity }
        }
      });
      if (eventUpdate.count === 1) {
        reserved = true;
      }
    }

    if (!reserved) {
      throw new HttpError(409, "Event capacity changed; please refresh and try again");
    }

    // Update ticket type reservedCount
    for (const item of validatedOrderItems) {
      await prisma.ticketType.update({
        where: { id: item.ticketType.id },
        data: { reservedCount: { increment: item.quantity } }
      });
    }

    const order = await prisma.ticketOrder.create({
      data: {
        orderNumber,
        userId: user.id,
        eventId: event.id,
        eventSlug: event.slug,
        status: "pending",
        currency,
        subtotalMinor,
        feesMinor: 0,
        totalMinor: subtotalMinor,
        paymentReference,
        customerEmail: user.email,
        customerName: user.name,
        expiresAt
      }
    });

    for (const item of validatedOrderItems) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          ticketTypeId: item.ticketType.id,
          ticketTypeName: item.ticketType.name,
          unitPriceMinor: item.unitPriceMinor,
          quantity: item.quantity,
          subtotalMinor: item.subtotalMinor
        }
      });
    }

    await prisma.inventoryReservation.create({
      data: {
        orderId: order.id,
        eventId: event.id,
        items: validatedOrderItems.map((i) => ({ ticketTypeId: i.ticketType.id, quantity: i.quantity })),
        status: "active",
        expiresAt
      }
    });

    // Schedule reservation expiration job
    await enqueueJob("expire_reservations", { orderId: order.id }, { runAt: expiresAt });

    // Initialize with Payment Provider
    try {
      const paymentInit = await this.provider.initializePayment({
        reference: paymentReference,
        orderNumber,
        amountMinor: subtotalMinor,
        currency,
        customerEmail: user.email,
        customerName: user.name,
        callbackUrl,
        metadata: {
          orderId: order.id,
          eventId: event.id,
          eventSlug: event.slug,
          userId: user.id
        }
      });

      return {
        order,
        authorizationUrl: paymentInit.authorizationUrl,
        accessCode: paymentInit.accessCode,
        reference: paymentReference
      };
    } catch (error) {
      // Revert reservation if initialization fails
      await this.cancelAndReleaseReservation(order.id);
      throw error;
    }
  }

  async cancelAndReleaseReservation(orderId: string) {
    const reservation = await prisma.inventoryReservation.findUnique({ where: { orderId } });
    if (!reservation || reservation.status !== "active") return;

    const items = reservation.items as Array<{ ticketTypeId: string; quantity: number }>;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    await prisma.$transaction(async (tx) => {
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: "released" }
      });

      await tx.ticketOrder.update({
        where: { id: orderId },
        data: { status: "cancelled", cancelledAt: new Date() }
      });

      await tx.event.updateMany({
        where: { id: reservation.eventId, reservedCount: { gte: totalQuantity } },
        data: { reservedCount: { decrement: totalQuantity } }
      });

      for (const item of items) {
        await tx.ticketType.updateMany({
          where: { id: item.ticketTypeId, reservedCount: { gte: item.quantity } },
          data: { reservedCount: { decrement: item.quantity } }
        });
      }
    });
  }

  async verifyAndCompletePayment(reference: string) {
    // 1. Check existing payment transaction for idempotency
    const existingTx = await prisma.paymentTransaction.findUnique({ where: { reference } });
    const order = await prisma.ticketOrder.findFirst({
      where: existingTx?.orderId
        ? { OR: [{ paymentReference: reference }, { id: existingTx.orderId }] }
        : { paymentReference: reference }
    });

    if (!order) {
      throw new HttpError(404, `Order with reference ${reference} not found`);
    }

    if (order.status === "paid" && existingTx?.status === "success") {
      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      return {
        success: true,
        alreadyProcessed: true,
        order,
        tickets
      };
    }

    // 2. Call provider verification
    const verified = await this.provider.verifyTransaction(reference);

    if (verified.status !== "success") {
      await prisma.paymentTransaction.upsert({
        where: { reference },
        update: {
          status: "failed",
          gatewayResponse: verified.gatewayResponse,
          rawPayload: verified.rawPayload as Prisma.InputJsonValue
        },
        create: {
          orderId: order.id,
          provider: this.provider.name,
          reference,
          status: "failed",
          amountMinor: verified.amountMinor || order.totalMinor,
          currency: verified.currency || order.currency,
          customerEmail: verified.customerEmail || order.customerEmail,
          gatewayResponse: verified.gatewayResponse,
          rawPayload: verified.rawPayload as Prisma.InputJsonValue
        }
      });

      await prisma.ticketOrder.update({
        where: { id: order.id },
        data: { status: "failed" }
      });

      return {
        success: false,
        order,
        message: verified.gatewayResponse || "Payment authorization failed"
      };
    }

    // Amount & currency verification
    if (verified.amountMinor !== order.totalMinor || verified.currency !== order.currency) {
      throw new HttpError(400, "Payment amount or currency mismatch detected");
    }

    // 3. Mark order as paid and confirm reservation
    const event = await prisma.event.findUnique({ where: { id: order.eventId } });
    if (!event) throw new HttpError(404, "Event not found");

    const orderItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

    const paidAt = verified.paidAt || new Date();

    const [updatedOrder] = await prisma.$transaction([
      prisma.ticketOrder.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paidAt
        }
      }),
      prisma.inventoryReservation.updateMany({
        where: { orderId: order.id },
        data: { status: "confirmed" }
      }),
      prisma.paymentTransaction.upsert({
        where: { reference },
        update: {
          status: "success",
          providerReference: verified.providerReference,
          channel: verified.channel,
          feesMinor: verified.feesMinor,
          paidAt,
          gatewayResponse: verified.gatewayResponse,
          rawPayload: verified.rawPayload as Prisma.InputJsonValue
        },
        create: {
          orderId: order.id,
          provider: this.provider.name,
          reference,
          providerReference: verified.providerReference,
          status: "success",
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          channel: verified.channel,
          customerEmail: verified.customerEmail,
          feesMinor: verified.feesMinor,
          paidAt,
          gatewayResponse: verified.gatewayResponse,
          rawPayload: verified.rawPayload as Prisma.InputJsonValue
        }
      }),
      prisma.event.update({
        where: { id: event.id },
        data: {
          ticketSalesCount: { increment: totalQuantity },
          attendeeCount: { increment: totalQuantity }
        }
      })
    ]);

    // 4. Issue Ticket & Registration
    let registration = await prisma.registration.findUnique({
      where: { userId_eventSlug: { userId: order.userId, eventSlug: order.eventSlug } }
    });

    const ticketCode = createTicketCode();

    if (!registration) {
      registration = await prisma.registration.create({
        data: {
          userId: order.userId,
          eventId: event.id,
          eventSlug: event.slug,
          ticketTypeId: orderItems[0]?.ticketTypeId,
          quantity: totalQuantity,
          approvalStatus: "approved",
          paymentStatus: "verified",
          registeredAt: new Date().toISOString(),
          checkedIn: false,
          ticketCode,
          reminders: [],
          status: "active",
          orderId: order.id
        }
      });
    } else {
      registration = await prisma.registration.update({
        where: { id: registration.id },
        data: {
          status: "active",
          approvalStatus: "approved",
          paymentStatus: "verified",
          quantity: { increment: totalQuantity },
          orderId: order.id
        }
      });
    }

    const finalTicketCode = registration.ticketCode || ticketCode;

    const ticket = await prisma.ticket.upsert({
      where: { registrationId: registration.id },
      update: {
        status: "valid",
        orderId: order.id
      },
      create: {
        registrationId: registration.id,
        eventId: event.id,
        ticketTypeId: orderItems[0]?.ticketTypeId,
        orderId: order.id,
        codeHash: hashToken(finalTicketCode),
        displayCode: finalTicketCode,
        status: "valid"
      }
    });

    // 5. Record Financial Ledger Entry (Verified Revenue)
    await prisma.financialLedgerEntry.create({
      data: {
        type: "sale",
        orderId: order.id,
        eventId: event.id,
        organizerSlug: event.organizerSlug,
        amountMinor: order.totalMinor,
        currency: order.currency,
        direction: "credit",
        description: `Ticket sale for ${event.title} (Order #${order.orderNumber})`
      }
    });

    // 6. In-App Notification
    await prisma.notification.create({
      data: {
        userId: order.userId,
        category: "ticket_purchase",
        title: "Tickets Confirmed!",
        message: `Your payment of ${order.currency} ${(order.totalMinor / 100).toLocaleString()} for ${event.title} was successful. Ticket code: ${ticket.displayCode}.`,
        eventSlug: event.slug
      }
    });

    // 7. Enqueue Confirmation & Receipt Emails
    const origin = process.env.FRONTEND_URL || "http://localhost:5173";
    const purchaseEmail = ticketPurchaseEmail({
      userName: order.customerName,
      orderNumber: order.orderNumber,
      eventTitle: event.title,
      eventDate: new Date(event.startsAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }),
      eventVenue: event.venue,
      currency: order.currency,
      totalMinor: order.totalMinor,
      tickets: orderItems.map((item) => ({
        name: item.ticketTypeName,
        quantity: item.quantity,
        code: ticket.displayCode
      })),
      walletUrl: `${origin}/dashboard/participant`
    });

    await enqueueEmail(order.customerEmail, purchaseEmail.subject, purchaseEmail.html, purchaseEmail.text);

    const receiptEmail = paymentReceiptEmail({
      userName: order.customerName,
      orderNumber: order.orderNumber,
      transactionReference: reference,
      currency: order.currency,
      totalMinor: order.totalMinor,
      paidAt: paidAt.toISOString(),
      eventTitle: event.title
    });

    await enqueueEmail(order.customerEmail, receiptEmail.subject, receiptEmail.html, receiptEmail.text);

    return {
      success: true,
      order: updatedOrder,
      ticket,
      registration
    };
  }

  async handleWebhook(rawBody: string | Buffer, signature: string) {
    const isValid = this.provider.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new HttpError(400, "Invalid webhook signature");
    }

    const { eventId, eventType, data, rawPayload } = this.provider.parseWebhookEvent(rawBody);

    // Duplicate webhook protection
    const existingWebhook = await prisma.paymentWebhookEvent.findUnique({
      where: { eventId }
    });

    if (existingWebhook) {
      return { status: "ignored", reason: "duplicate_webhook" };
    }

    await prisma.paymentWebhookEvent.create({
      data: {
        provider: this.provider.name,
        eventId,
        eventType,
        signature,
        status: "received",
        payload: rawPayload as Prisma.InputJsonValue
      }
    });

    try {
      if (eventType === "charge.success") {
        const reference = String(data.reference || "");
        if (reference) {
          await this.verifyAndCompletePayment(reference);
        }
      } else if (eventType === "refund.processed") {
        const refundId = String(data.id || "");
        const transactionRef = String(data.transaction_reference || "");
        if (refundId || transactionRef) {
          await prisma.refund.updateMany({
            where: {
              OR: [{ providerRefundId: refundId }, { paymentTransactionId: transactionRef }]
            },
            data: {
              status: "completed",
              processedAt: new Date()
            }
          });
        }
      }

      await prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: { status: "processed", processedAt: new Date() }
      });

      return { status: "processed" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: { status: "failed", processingError: msg }
      });
      throw error;
    }
  }

  async requestRefund(user: User, orderId: string, reason: string) {
    const order = await prisma.ticketOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.userId !== user.id) throw new HttpError(403, "You can only request refunds for your own orders");
    if (order.status !== "paid") throw new HttpError(409, "Only paid orders can be refunded");

    const existingRefund = await prisma.refund.findFirst({
      where: { orderId: order.id, status: { in: ["requested", "approved", "completed"] } }
    });
    if (existingRefund) {
      throw new HttpError(409, "A refund request already exists for this order");
    }

    const tx = await prisma.paymentTransaction.findFirst({
      where: { orderId: order.id, status: "success" }
    });

    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        paymentTransactionId: tx?.id,
        userId: user.id,
        eventId: order.eventId,
        amountMinor: order.totalMinor,
        currency: order.currency,
        reason,
        status: "requested"
      }
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        category: "refund_update",
        title: "Refund Request Submitted",
        message: `Your refund request for order #${order.orderNumber} has been submitted for review.`,
        eventSlug: order.eventSlug
      }
    });

    return refund;
  }

  async decideRefund(
    request: Request,
    actor: User,
    refundId: string,
    decision: "approved" | "rejected",
    rejectionReason?: string
  ) {
    const refund = await prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new HttpError(404, "Refund not found");
    if (refund.status !== "requested") throw new HttpError(409, `Refund is already ${refund.status}`);

    const event = await prisma.event.findUnique({ where: { id: refund.eventId } });
    if (!event) throw new HttpError(404, "Event not found");

    const isOrganizer = actor.role === "organizer" && actor.organizerSlug === event.organizerSlug;
    const isAdmin = actor.role === "admin";
    if (!isOrganizer && !isAdmin) {
      throw new HttpError(403, "Permission denied");
    }

    const order = await prisma.ticketOrder.findUnique({ where: { id: refund.orderId } });
    if (!order) throw new HttpError(404, "Associated order not found");

    const attendee = await prisma.user.findUnique({ where: { id: refund.userId } });

    if (decision === "rejected") {
      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: "rejected",
          reviewedById: actor.id,
          reviewedAt: new Date(),
          rejectionReason
        }
      });

      await writeAudit(request, actor, "refund.rejected", "refund", refund.id, { reason: rejectionReason });

      if (attendee) {
        const emailContent = refundStatusEmail({
          userName: attendee.name,
          orderNumber: order.orderNumber,
          eventTitle: event.title,
          currency: refund.currency,
          amountMinor: refund.amountMinor,
          status: "rejected",
          reason: rejectionReason
        });
        await enqueueEmail(attendee.email, emailContent.subject, emailContent.html, emailContent.text);
      }

      return updated;
    }

    // Decision === "approved": execute provider refund
    const tx = await prisma.paymentTransaction.findFirst({
      where: { orderId: order.id, status: "success" }
    });
    if (!tx) throw new HttpError(404, "Original payment transaction record not found");

    const providerResult = await this.provider.initiateRefund({
      transactionReference: tx.reference,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      merchantNote: `Refund approved by ${actor.name}`
    });

    const finalStatus = providerResult.status === "completed" ? "completed" : "approved";

    const [updatedRefund] = await prisma.$transaction([
      prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: finalStatus,
          providerRefundId: providerResult.refundId,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          processedAt: finalStatus === "completed" ? new Date() : null,
          rawPayload: providerResult.rawPayload as Prisma.InputJsonValue
        }
      }),
      prisma.ticketOrder.update({
        where: { id: order.id },
        data: { status: "refunded" }
      }),
      prisma.ticket.updateMany({
        where: { orderId: order.id },
        data: { status: "cancelled", invalidatedAt: new Date() }
      }),
      prisma.registration.updateMany({
        where: { orderId: order.id },
        data: { status: "cancelled", statusReason: "Order refunded" }
      }),
      prisma.financialLedgerEntry.create({
        data: {
          type: "refund",
          orderId: order.id,
          eventId: event.id,
          organizerSlug: event.organizerSlug,
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          direction: "debit",
          description: `Refund for Order #${order.orderNumber}`
        }
      })
    ]);

    await writeAudit(request, actor, "refund.approved", "refund", refund.id, {
      amountMinor: refund.amountMinor,
      providerRefundId: providerResult.refundId
    });

    if (attendee) {
      const emailContent = refundStatusEmail({
        userName: attendee.name,
        orderNumber: order.orderNumber,
        eventTitle: event.title,
        currency: refund.currency,
        amountMinor: refund.amountMinor,
        status: finalStatus === "completed" ? "completed" : "approved"
      });
      await enqueueEmail(attendee.email, emailContent.subject, emailContent.html, emailContent.text);
    }

    return updatedRefund;
  }

  async getOrganizerRevenueMetrics(organizerSlug: string) {
    const events = await prisma.event.findMany({
      where: { organizerSlug, deletedAt: null },
      select: { id: true, slug: true, title: true }
    });

    const eventIds = events.map((e) => e.id);
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: { createdAt: "asc" }
    });

    const orders = await prisma.ticketOrder.findMany({
      where: { eventId: { in: eventIds }, status: "paid" },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    let grossMinor = 0;
    let refundedMinor = 0;
    const currencies = new Set<string>();

    for (const entry of ledger) {
      currencies.add(entry.currency);
      if (entry.type === "sale" && entry.direction === "credit") {
        grossMinor += entry.amountMinor;
      } else if (entry.type === "refund" && entry.direction === "debit") {
        refundedMinor += entry.amountMinor;
      }
    }

    const netMinor = Math.max(0, grossMinor - refundedMinor);

    const byEvent = events.map((ev) => {
      const evLedger = ledger.filter((l) => l.eventId === ev.id);
      let evGross = 0;
      let evRefund = 0;
      for (const item of evLedger) {
        if (item.type === "sale") evGross += item.amountMinor;
        if (item.type === "refund") evRefund += item.amountMinor;
      }
      return {
        eventId: ev.id,
        eventSlug: ev.slug,
        title: ev.title,
        grossMinor: evGross,
        refundedMinor: evRefund,
        netMinor: evGross - evRefund,
        ordersCount: orders.filter((o) => o.eventId === ev.id).length
      };
    });

    return {
      configured: true,
      currencies: Array.from(currencies),
      grossMinor,
      refundedMinor,
      netMinor,
      grossFormatted: (grossMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      netFormatted: (netMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      byEvent,
      recentOrders: orders
    };
  }

  async getAdminFinancialOverview() {
    const [totalOrders, paidOrders, totalRefunds, ledgerEntries] = await Promise.all([
      prisma.ticketOrder.count(),
      prisma.ticketOrder.count({ where: { status: "paid" } }),
      prisma.refund.count(),
      prisma.financialLedgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 1000 })
    ]);

    let totalGrossMinor = 0;
    let totalRefundedMinor = 0;

    for (const entry of ledgerEntries) {
      if (entry.type === "sale" && entry.direction === "credit") {
        totalGrossMinor += entry.amountMinor;
      } else if (entry.type === "refund" && entry.direction === "debit") {
        totalRefundedMinor += entry.amountMinor;
      }
    }

    return {
      totalOrders,
      paidOrders,
      totalRefunds,
      totalGrossMinor,
      totalRefundedMinor,
      totalNetMinor: totalGrossMinor - totalRefundedMinor,
      recentLedger: ledgerEntries.slice(0, 20)
    };
  }
}

export const paymentService = new PaymentService();
