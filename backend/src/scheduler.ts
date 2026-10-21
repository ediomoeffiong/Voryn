import { prisma } from "./db.js";
import { publicationErrors, publicEvent, ticketsFor, writeLifecycle } from "./events.js";
import { addEventToStore, events as cachedEvents, updateEventVisibility } from "./data.js";
import type { Event } from "./domain.js";

export async function publishDueEvents(now = new Date()) {
  const due = await prisma.event.findMany({ where: { status: "scheduled", publishAt: { lte: now }, deletedAt: null }, take: 100 });
  const result = { examined: due.length, published: 0, invalid: [] as string[] };
  for (const event of due) {
    const errors = publicationErrors(event, await ticketsFor(event.id));
    if (errors.length) { result.invalid.push(event.id); continue; }
    const updated = await prisma.event.updateMany({ where: { id: event.id, status: "scheduled", version: event.version, publishAt: { lte: now } }, data: { status: "published", publishedAt: now, publishAt: null, version: { increment: 1 } } });
    if (updated.count === 1) {
      const actor = await prisma.user.findFirst({ where: { organizerSlug: event.organizerSlug, role: "organizer" } });
      if (actor) await writeLifecycle(event, actor, "published_by_scheduler", { status: "scheduled" }, { status: "published" });
      const published = await prisma.event.findUnique({ where: { id: event.id } });
      if (published) {
        const cached = publicEvent(published, [], false) as unknown as Event;
        const current = cachedEvents.find((item) => item.id === event.id);
        if (current) Object.assign(current, cached); else addEventToStore(cached);
        updateEventVisibility(cached);
      }
      result.published += 1;
    }
  }
  return result;
}

