import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { emailService } from "./email.js";
import { eventReminderEmail, eventAnnouncementEmail } from "./templates.js";
import { publishDueEvents } from "../scheduler.js";

export type JobType = "email" | "reminder" | "expire_reservations" | "publish_due" | "announcement";

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options: { runAt?: Date; maxAttempts?: number } = {}
) {
  return prisma.backgroundJob.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
      status: "queued"
    }
  });
}

export async function enqueueEmail(to: string, subject: string, html: string, text?: string, metadata?: Record<string, unknown>) {
  return enqueueJob("email", { to, subject, html, text, ...metadata });
}

export async function processSingleJob(job: {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}): Promise<boolean> {
  const payload = job.payload as Record<string, unknown>;

  switch (job.type) {
    case "email": {
      const { to, subject, html, text } = payload as { to: string; subject: string; html: string; text?: string };
      const result = await emailService.sendEmail({ to, subject, html, text });
      if (!result.success) throw new Error(result.error || "Email delivery failed");
      return true;
    }

    case "publish_due": {
      await publishDueEvents();
      return true;
    }

    case "expire_reservations": {
      const now = new Date();
      const expired = await prisma.inventoryReservation.findMany({
        where: {
          status: "active",
          expiresAt: { lte: now }
        },
        take: 50
      });

      for (const res of expired) {
        // If order was already paid, confirm reservation
        const order = await prisma.ticketOrder.findUnique({ where: { id: res.orderId } });
        if (order && order.status === "paid") {
          await prisma.inventoryReservation.update({
            where: { id: res.id },
            data: { status: "confirmed" }
          });
          continue;
        }

        // Release inventory
        const items = res.items as Array<{ ticketTypeId: string; quantity: number }>;
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

        await prisma.$transaction(async (tx) => {
          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: { status: "expired" }
          });

          if (order && order.status === "pending") {
            await tx.ticketOrder.update({
              where: { id: order.id },
              data: { status: "expired" }
            });
          }

          // Decrement event reservedCount
          await tx.event.updateMany({
            where: { id: res.eventId, reservedCount: { gte: totalQuantity } },
            data: { reservedCount: { decrement: totalQuantity } }
          });

          // Decrement each ticketType reservedCount
          for (const item of items) {
            await tx.ticketType.updateMany({
              where: { id: item.ticketTypeId, reservedCount: { gte: item.quantity } },
              data: { reservedCount: { decrement: item.quantity } }
            });
          }
        });
      }
      return true;
    }

    case "reminder": {
      const { registrationId, offset } = payload as { registrationId: string; offset: string };
      const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
      if (!registration || registration.status !== "active" || registration.approvalStatus !== "approved") {
        return true; // no longer active
      }

      const event = await prisma.event.findUnique({ where: { slug: registration.eventSlug } });
      if (!event || event.status === "cancelled" || event.deletedAt) {
        return true; // event cancelled or removed
      }

      const attendee = await prisma.user.findUnique({ where: { id: registration.userId } });
      if (!attendee) return true;

      // In-app notification
      await prisma.notification.create({
        data: {
          userId: attendee.id,
          category: "event_reminder",
          title: `Reminder: ${event.title}`,
          message: `${event.title} is taking place ${offset.toLowerCase()}. Venue: ${event.venue}.`,
          eventSlug: event.slug
        }
      });

      // Email notification
      const userPrefs = attendee.notifications as { email?: boolean } | null;
      if (userPrefs?.email !== false) {
        const origin = process.env.FRONTEND_URL || "http://localhost:5173";
        const emailContent = eventReminderEmail({
          userName: attendee.name,
          eventTitle: event.title,
          eventDate: new Date(event.startsAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }),
          eventVenue: event.venue,
          timingNotice: offset,
          ticketCode: registration.ticketCode,
          walletUrl: `${origin}/dashboard/participant`
        });

        await emailService.sendEmail({
          to: attendee.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
      }
      return true;
    }

    case "announcement": {
      const { announcementId } = payload as { announcementId: string };
      const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
      if (!announcement || announcement.status === "cancelled") return true;

      const event = await prisma.event.findFirst({ where: { slug: announcement.eventSlug, deletedAt: null } });
      if (!event) return true;

      const organizer = await prisma.organizer.findUnique({ where: { slug: announcement.organizerSlug } });
      const organizerName = organizer?.name || "The Organizer";

      const where: Prisma.RegistrationWhereInput = {
        eventSlug: event.slug,
        status: "active",
        ...(announcement.audience === "pending"
          ? { approvalStatus: "pending" }
          : announcement.audience === "checked_in"
            ? { approvalStatus: "approved", checkedIn: true }
            : announcement.audience === "not_checked_in"
              ? { approvalStatus: "approved", checkedIn: false }
              : { approvalStatus: "approved" })
      };

      const registrations = await prisma.registration.findMany({ where });
      const users = await prisma.user.findMany({
        where: { id: { in: registrations.map((r) => r.userId) } }
      });

      const origin = process.env.FRONTEND_URL || "http://localhost:5173";
      for (const recipient of users) {
        // in-app notification
        await prisma.notification.create({
          data: {
            userId: recipient.id,
            category: "announcement",
            title: announcement.subject,
            message: announcement.message,
            eventSlug: event.slug
          }
        });

        // Email
        const emailContent = eventAnnouncementEmail({
          userName: recipient.name,
          eventTitle: event.title,
          organizerName,
          subject: announcement.subject,
          message: announcement.message,
          eventUrl: `${origin}/events/${event.slug}`
        });

        await emailService.sendEmail({
          to: recipient.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
      }

      await prisma.announcement.update({
        where: { id: announcement.id },
        data: {
          status: "sent",
          sentAt: new Date().toISOString(),
          recipientCount: users.length
        }
      });

      return true;
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

export async function processPendingJobs(limit = 20): Promise<{ processed: number; errors: number }> {
  const now = new Date();
  const workerId = `worker_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;

  // Find due jobs that are not currently locked
  const candidates = await prisma.backgroundJob.findMany({
    where: {
      status: { in: ["queued", "failed"] },
      runAt: { lte: now },
      attempts: { lt: 5 }
    },
    take: limit,
    orderBy: { runAt: "asc" }
  });

  let processed = 0;
  let errors = 0;

  for (const job of candidates) {
    // Acquire lock atomically
    const lockResult = await prisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        lockedAt: null
      },
      data: {
        status: "processing",
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 }
      }
    });

    if (lockResult.count !== 1) {
      continue; // Acquired by another worker
    }

    try {
      await processSingleJob(job);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null
        }
      });
      processed += 1;
    } catch (error) {
      errors += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const nextAttempt = job.attempts + 1;

      if (nextAttempt >= job.maxAttempts) {
        // Move to dead_letter
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "dead_letter",
            lastError: errorMessage,
            lockedAt: null,
            lockedBy: null
          }
        });
      } else {
        // Exponential backoff: 30s * 2^attempts
        const backoffSeconds = Math.min(3600, 30 * Math.pow(2, job.attempts));
        const nextRunAt = new Date(Date.now() + backoffSeconds * 1000);

        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            runAt: nextRunAt,
            lastError: errorMessage,
            lockedAt: null,
            lockedBy: null
          }
        });
      }
    }
  }

  return { processed, errors };
}
