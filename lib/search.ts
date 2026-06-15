import { cities, organizers, publicEvents } from "./data";
import { DiscoveryMode } from "./domain";

export function searchEvents(query: string, mode?: DiscoveryMode) {
  const normalized = query.trim().toLowerCase();
  const scoped = mode ? publicEvents.filter((event) => event.mode === mode) : publicEvents;

  if (!normalized) return scoped.slice(0, 6);

  return scoped.filter((event) => {
    const organizer = organizers.find((item) => item.slug === event.organizerSlug);
    const city = cities.find((item) => item.slug === event.citySlug);
    const haystack = [
      event.title,
      event.category,
      event.type,
      event.country,
      organizer?.name,
      city?.name,
      city?.country
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}
