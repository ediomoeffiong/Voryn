import { cities, organizers, publicEvents } from "./data.js";
import { DiscoveryMode, Interest } from "./domain.js";
import type { LocationContext } from "./personalization.js";

type SearchOptions = {
  mode?: DiscoveryMode;
  countryCode?: string;
  interests?: Interest[];
  location?: LocationContext;
};

function scoreEvent(eventCountryCode: string | undefined, category: Interest, options: SearchOptions) {
  let score = 0;
  if (options.countryCode && eventCountryCode === options.countryCode.toUpperCase()) score += 35;
  if (options.location?.countryCode && eventCountryCode === options.location.countryCode) score += 20;
  if (options.interests?.includes(category)) score += 45;
  return score;
}

export function searchEvents(query: string, options: SearchOptions = {}) {
  const normalized = query.trim().toLowerCase();
  const scoped = options.mode ? publicEvents.filter((event) => event.mode === options.mode) : publicEvents;

  const matched = !normalized
    ? scoped
    : scoped.filter((event) => {
        const organizer = organizers.find((item) => item.slug === event.organizerSlug);
        const city = cities.find((item) => item.slug === event.citySlug);
        const haystack = [
          event.title,
          event.category,
          event.type,
          event.country,
          organizer?.name,
          city?.name,
          city?.country,
          city?.countryCode
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalized);
      });

  return matched
    .sort((a, b) => {
      const cityA = cities.find((city) => city.slug === a.citySlug);
      const cityB = cities.find((city) => city.slug === b.citySlug);
      return (
        scoreEvent(cityB?.countryCode, b.category, options) +
        b.attendeeCount * 0.001 -
        (scoreEvent(cityA?.countryCode, a.category, options) + a.attendeeCount * 0.001)
      );
    })
    .slice(0, 8);
}
