import type { Express, Request, Response } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { requireAdmin, requireAuth, requireOrganizationPermission, requireOrganizer, requireParticipantAccess } from "../auth.js";
import { asyncHandler, HttpError } from "../http.js";
import { prisma } from "../db.js";
import { paymentService } from "./service.js";

const checkoutSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(
    z.object({
      ticketTypeId: z.string().min(1),
      quantity: z.number().int().min(1).max(100)
    })
  ).min(1),
  callbackUrl: z.string().url().optional()
}).strict();

const refundRequestSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(5).max(1000)
}).strict();

const refundDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(1000).optional()
}).strict();

export function registerPaymentRoutes(app: Express) {
  // 1. Checkout initialization (Attendee)
  app.post(
    "/api/payments/checkout/initialize",
    requireParticipantAccess,
    asyncHandler(async (request: Request, response: Response) => {
      const user = response.locals.user as User;
      const input = checkoutSchema.parse(request.body);
      const result = await paymentService.createOrderAndInitializePayment(
        user,
        input.eventSlug,
        input.items,
        input.callbackUrl
      );
      response.status(201).json(result);
    })
  );

  // 2. User's own orders
  app.get(
    "/api/payments/orders/my",
    requireParticipantAccess,
    asyncHandler(async (_request: Request, response: Response) => {
      const user = response.locals.user as User;
      const orders = await prisma.ticketOrder.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      });
      response.json({ orders });
    })
  );

  // 2b. Order details (Authenticated Attendee / Organizer / Admin)
  app.get(
    "/api/payments/orders/:orderNumber",
    requireAuth,
    asyncHandler(async (request: Request, response: Response) => {
      const user = response.locals.user as User;
      const order = await prisma.ticketOrder.findUnique({
        where: { orderNumber: String(request.params.orderNumber) }
      });
      if (!order) throw new HttpError(404, "Order not found");

      const isOwner = order.userId === user.id;
      const isAdmin = user.role === "admin";
      let isOrganizer = false;
      if (user.role === "organizer" && user.organizerSlug) {
        const ev = await prisma.event.findUnique({ where: { id: order.eventId } });
        isOrganizer = ev?.organizerSlug === user.organizerSlug;
      }

      if (!isOwner && !isAdmin && !isOrganizer) {
        throw new HttpError(403, "Access denied to order");
      }

      const [items, transaction, tickets] = await Promise.all([
        prisma.orderItem.findMany({ where: { orderId: order.id } }),
        prisma.paymentTransaction.findFirst({ where: { orderId: order.id } }),
        prisma.ticket.findMany({ where: { orderId: order.id } })
      ]);

      response.json({ order, items, transaction, tickets });
    })
  );

  // 3. Server-side payment verification
  app.get(
    "/api/payments/verify/:reference",
    asyncHandler(async (request: Request, response: Response) => {
      const reference = String(request.params.reference);
      const result = await paymentService.verifyAndCompletePayment(reference);
      response.json(result);
    })
  );

  // 4. Paystack Webhook (RAW body signature verification)
  app.post(
    "/api/payments/webhook",
    asyncHandler(async (request: Request, response: Response) => {
      const signature = String(request.headers["x-paystack-signature"] || "");
      if (!signature) throw new HttpError(400, "Missing signature header");

      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(request.body));
      const result = await paymentService.handleWebhook(rawBody, signature);
      response.json(result);
    })
  );

  // 5. Participant Refund Request
  app.post(
    "/api/payments/refunds/request",
    requireParticipantAccess,
    asyncHandler(async (request: Request, response: Response) => {
      const user = response.locals.user as User;
      const input = refundRequestSchema.parse(request.body);
      const refund = await paymentService.requestRefund(user, input.orderId, input.reason);
      response.status(201).json({ refund });
    })
  );

  // 6. Participant's refunds list
  app.get(
    "/api/payments/refunds/my",
    requireParticipantAccess,
    asyncHandler(async (_request: Request, response: Response) => {
      const user = response.locals.user as User;
      const refunds = await prisma.refund.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      });
      response.json({ refunds });
    })
  );

  // 7. Organizer Verified Revenue Metrics
  app.get(
    "/api/payments/organizer/revenue",
    requireOrganizer,
    requireOrganizationPermission,
    asyncHandler(async (_request: Request, response: Response) => {
      const user = response.locals.user as User;
      const metrics = await paymentService.getOrganizerRevenueMetrics(user.organizerSlug!);
      response.json(metrics);
    })
  );

  // 8. Organizer Orders list
  app.get(
    "/api/payments/organizer/orders",
    requireOrganizer,
    requireOrganizationPermission,
    asyncHandler(async (_request: Request, response: Response) => {
      const user = response.locals.user as User;
      const events = await prisma.event.findMany({
        where: { organizerSlug: user.organizerSlug!, deletedAt: null },
        select: { id: true }
      });
      const orders = await prisma.ticketOrder.findMany({
        where: { eventId: { in: events.map((e) => e.id) } },
        orderBy: { createdAt: "desc" },
        take: 100
      });
      response.json({ orders });
    })
  );

  // 9. Organizer Refunds list
  app.get(
    "/api/payments/organizer/refunds",
    requireOrganizer,
    requireOrganizationPermission,
    asyncHandler(async (_request: Request, response: Response) => {
      const user = response.locals.user as User;
      const events = await prisma.event.findMany({
        where: { organizerSlug: user.organizerSlug!, deletedAt: null },
        select: { id: true }
      });
      const refunds = await prisma.refund.findMany({
        where: { eventId: { in: events.map((e) => e.id) } },
        orderBy: { createdAt: "desc" }
      });
      response.json({ refunds });
    })
  );

  // 10. Organizer Refund Decision
  app.post(
    "/api/payments/organizer/refunds/:id/decision",
    requireOrganizer,
    requireOrganizationPermission,
    asyncHandler(async (request: Request, response: Response) => {
      const user = response.locals.user as User;
      const input = refundDecisionSchema.parse(request.body);
      const refund = await paymentService.decideRefund(
        request,
        user,
        String(request.params.id),
        input.decision,
        input.reason
      );
      response.json({ refund });
    })
  );

  // 11. Admin Platform Financial Overview
  app.get(
    "/api/payments/admin/overview",
    requireAdmin,
    asyncHandler(async (_request: Request, response: Response) => {
      const overview = await paymentService.getAdminFinancialOverview();
      response.json(overview);
    })
  );
}
