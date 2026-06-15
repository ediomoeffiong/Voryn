import { cities, organizers, publicEvents } from "./data";
import { City, DiscoveryMode, Event, EventBadge, Organizer } from "./domain";

export type CityDiscoveryModel = {
  city: City;
  featuredEvents: Event[];
  trendingEvents: Event[];
  upcomingEvents: Event[];
  localOrganizers: Organizer[];
  categories: string[];
  fallbackEvents: Event[];
};

export const eventsBySlug = new Map(publicEvents.map((event) => [event.slug, event]));
export const citiesBySlug = new Map(cities.map((city) => [city.slug, city]));
export const organizersBySlug = new Map(organizers.map((organizer) => [organizer.slug, organizer]));

export function byBadge(badge: EventBadge) {
  return publicEvents.filter((event) => event.badges.includes(badge));
}

export function byMode(mode: DiscoveryMode) {
  return publicEvents.filter((event) => event.mode === mode);
}

export function getCityDiscoveryModel(citySlug: string): CityDiscoveryModel | undefined {
  const city = citiesBySlug.get(citySlug);
  if (!city) return undefined;

  const cityEvents = publicEvents.filter((event) => event.citySlug === city.slug);
  const organizerSlugs = new Set(cityEvents.map((event) => event.organizerSlug));
  const categories = [...new Set(cityEvents.map((event) => event.category))].sort();

  return {
    city,
    featuredEvents: cityEvents.filter((event) => event.badges.includes("featured")),
    trendingEvents: cityEvents.filter((event) => event.badges.includes("trending")),
    upcomingEvents: cityEvents.filter((event) => event.status !== "completed"),
    localOrganizers: organizers.filter((organizer) => organizerSlugs.has(organizer.slug)),
    categories,
    fallbackEvents: byMode("online").slice(0, 3)
  };
}

export function getHomepageMetrics() {
  return publicEvents.reduce(
    (totals, event) => ({
      attendees: totals.attendees + event.attendeeCount,
      rsvps: totals.rsvps + event.rsvpCount,
      tickets: totals.tickets + event.ticketSalesCount
    }),
    { attendees: 0, rsvps: 0, tickets: 0 }
  );
}

export function getModeCollections() {
  return (["local", "online", "global"] as DiscoveryMode[]).map((mode) => ({
    mode,
    events: byMode(mode),
    topCity: cities.find((city) => byMode(mode).some((event) => event.citySlug === city.slug))
  }));
}
