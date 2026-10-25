import { pathToFileURL } from "node:url";
import { initDb, disconnectDb, isDatabaseReady, prisma } from "./db.js";
import { processPendingJobs, enqueueJob } from "./notifications/queue.js";
import { publishDueEvents } from "./scheduler.js";

let isRunning = false;
let loopTimer: NodeJS.Timeout | null = null;
let reminderScanTimer: NodeJS.Timeout | null = null;

export async function scanAndEnqueueReminders() {
  if (!isDatabaseReady()) return;

  const now = Date.now();
  const offsets = [
    { label: "7 days before", ms: 7 * 86400000 },
    { label: "1 day before", ms: 86400000 },
    { label: "1 hour before", ms: 3600000 },
    { label: "Event start time", ms: 0 }
  ];

  try {
    // Find active registrations for published upcoming events
    const publishedEvents = await prisma.event.findMany({
      where: {
        status: "published",
        deletedAt: null
      },
      select: { id: true, slug: true, startsAt: true, title: true }
    });

    for (const ev of publishedEvents) {
      const eventTime = new Date(ev.startsAt).getTime();
      if (Number.isNaN(eventTime)) continue;

      for (const offset of offsets) {
        const triggerTime = eventTime - offset.ms;
        // If trigger time is within the next 15 minutes and hasn't passed more than 30 mins ago
        if (triggerTime >= now - 1800000 && triggerTime <= now + 900000) {
          const registrations = await prisma.registration.findMany({
            where: {
              eventSlug: ev.slug,
              status: "active",
              approvalStatus: "approved"
            },
            take: 200
          });

          const recentJobs = await prisma.backgroundJob.findMany({
            where: {
              type: "reminder",
              status: { in: ["queued", "processing", "completed"] }
            },
            take: 200
          });
          const existingRegIds = new Set(
            recentJobs.map((j) => (j.payload as { registrationId?: string })?.registrationId).filter(Boolean)
          );

          for (const reg of registrations) {
            if (!existingRegIds.has(reg.id)) {
              await enqueueJob(
                "reminder",
                { registrationId: reg.id, offset: offset.label },
                { runAt: new Date(triggerTime) }
              );
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error scanning reminders:", error);
  }
}

export async function runWorkerIteration() {
  if (!isRunning || !isDatabaseReady()) return;

  try {
    // 1. Process pending jobs in queue
    await processPendingJobs(25);

    // 2. Publish due events
    await publishDueEvents();
  } catch (error) {
    console.error("Worker iteration error:", error);
  }
}

export function startBackgroundWorker(intervalMs = 10000) {
  if (isRunning) return;
  isRunning = true;
  console.info(`[Background Worker] Started polling every ${intervalMs}ms`);

  // Main processing loop
  const loop = async () => {
    if (!isRunning) return;
    await runWorkerIteration();
    if (isRunning) {
      loopTimer = setTimeout(loop, intervalMs);
    }
  };

  loopTimer = setTimeout(loop, 1000);

  // Reminder scanner every 5 minutes
  const scanLoop = async () => {
    if (!isRunning) return;
    await scanAndEnqueueReminders();
    if (isRunning) {
      reminderScanTimer = setTimeout(scanLoop, 5 * 60 * 1000);
    }
  };

  reminderScanTimer = setTimeout(scanLoop, 5000);
}

export function stopBackgroundWorker() {
  isRunning = false;
  if (loopTimer) clearTimeout(loopTimer);
  if (reminderScanTimer) clearTimeout(reminderScanTimer);
  console.info("[Background Worker] Stopped");
}

export function getWorkerStatus() {
  return {
    running: isRunning,
    lastHeartbeat: new Date().toISOString()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initDb()
    .then(() => {
      startBackgroundWorker(10000);
      const shutdown = async (signal: string) => {
        console.info(`Worker received ${signal}, shutting down`);
        stopBackgroundWorker();
        await disconnectDb();
        process.exit(0);
      };
      process.once("SIGINT", () => void shutdown("SIGINT"));
      process.once("SIGTERM", () => void shutdown("SIGTERM"));
    })
    .catch((err) => {
      console.error("Worker failed to start:", err);
      process.exit(1);
    });
}
