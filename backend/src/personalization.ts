import type { Request } from "express";
import { cities, publicEvents } from "./data.js";
import type { City, Event, Interest } from "./domain.js";

export const interests: Interest[] = [
  "Technology",
  "Business",
  "Startups",
  "Music",
  "Entertainment",
  "Sports",
  "Networking",
  "Education",
  "Career",
  "Finance",
  "Fashion",
  "Health",
  "Gaming",
  "Arts",
  "Religion",
  "Community Events"
];

type CountryConfig = {
  country: string;
  countryCode: string;
  capitalSlugs: string[];
  prioritySlugs: string[];
};

const countryConfigs: Record<string, CountryConfig> = {
  NG: {
    country: "Nigeria",
    countryCode: "NG",
    capitalSlugs: ["lagos", "abuja"],
    prioritySlugs: ["lagos", "abuja", "port-harcourt"]
  },
  US: {
    country: "United States",
    countryCode: "US",
    capitalSlugs: ["washington-dc"],
    prioritySlugs: ["washington-dc", "new-york"]
  },
  GB: {
    country: "United Kingdom",
    countryCode: "GB",
    capitalSlugs: ["london"],
    prioritySlugs: ["london"]
  },
  UK: {
    country: "United Kingdom",
    countryCode: "GB",
    capitalSlugs: ["london"],
    prioritySlugs: ["london"]
  },
  CA: {
    country: "Canada",
    countryCode: "CA",
    capitalSlugs: ["ottawa"],
    prioritySlugs: ["ottawa"]
  }
};

const defaultCountryCode = "NG";

export type LocationContext = {
  country: string;
  countryCode: string;
  source: "browser" | "ip" | "default";
  coordinates?: { lat: number; lng: number };
  nearestCity?: City;
};

export type NavigationItem = {
  label: string;
  href: string;
  kind: "nearby" | "capital" | "global";
};

function configForCountry(countryCode: string | undefined) {
  const normalized = countryCode?.trim().toUpperCase();
  return (normalized ? countryConfigs[normalized] : undefined) ?? countryConfigs[defaultCountryCode];
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestCityTo(coordinates: { lat: number; lng: number }, candidates = cities) {
  return candidates
    .map((city) => ({ city, distance: distanceKm(coordinates, city.coordinates) }))
    .sort((a, b) => a.distance - b.distance)[0]?.city;
}

function parseCoordinate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function headerCountry(request: Request) {
  const headers = [
    request.header("cf-ipcountry"),
    request.header("x-vercel-ip-country"),
    request.header("x-country-code"),
    request.header("cloudfront-viewer-country")
  ];
  return headers.find((value) => value && value !== "XX");
}

export function parseInterests(value: unknown): Interest[] {
  if (typeof value !== "string") return [];
  const selected = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return interests.filter((interest) => selected.includes(interest));
}

export function resolveLocation(request: Request): LocationContext {
  const lat = parseCoordinate(request.query.lat);
  const lng = parseCoordinate(request.query.lng);

  if (lat !== undefined && lng !== undefined) {
    const nearestCity = nearestCityTo({ lat, lng });
    const config = configForCountry(nearestCity?.countryCode);
    return {
      country: config.country,
      countryCode: config.countryCode,
      source: "browser",
      coordinates: { lat, lng },
      nearestCity
    };
  }

  const queryCountry = typeof request.query.countryCode === "string" ? request.query.countryCode : undefined;
  const detectedCountry = queryCountry ?? headerCountry(request);
  const config = configForCountry(detectedCountry);

  return {
    country: config.country,
    countryCode: config.countryCode,
    source: detectedCountry ? "ip" : "default"
  };
}

export function getNavigation(location: LocationContext): NavigationItem[] {
  const config = configForCountry(location.countryCode);
  const capitalCities = config.capitalSlugs
    .map((slug) => cities.find((city) => city.slug === slug))
    .filter((city): city is City => Boolean(city));

  return [
    { label: "Near You", href: "/search?scope=near-you", kind: "nearby" },
    ...capitalCities.map((city) => ({
      label: `${city.name} Events`,
      href: `/${city.slug}`,
      kind: "capital" as const
    })),
    { label: "Global Events", href: "/search?mode=global", kind: "global" }
  ];
}

export function nearbyEvents(location: LocationContext) {
  const config = configForCountry(location.countryCode);
  const countryCities = cities.filter((city) => city.countryCode === config.countryCode);
  const rankedCities =
    location.coordinates && countryCities.length
      ? [...countryCities].sort(
          (a, b) => distanceKm(location.coordinates!, a.coordinates) - distanceKm(location.coordinates!, b.coordinates)
        )
      : config.prioritySlugs
          .map((slug) => cities.find((city) => city.slug === slug))
          .filter((city): city is City => Boolean(city));
  const rankByCity = new Map(rankedCities.map((city, index) => [city.slug, index]));

  return publicEvents
    .filter((event) => rankByCity.has(event.citySlug) && event.mode === "local")
    .sort((a, b) => (rankByCity.get(a.citySlug) ?? 99) - (rankByCity.get(b.citySlug) ?? 99));
}

export function globalEvents() {
  return publicEvents
    .filter((event) => event.mode === "global" || event.mode === "online")
    .sort((a, b) => b.attendeeCount + b.rsvpCount - (a.attendeeCount + a.rsvpCount));
}

export type PersonalizationContext = {
  location: LocationContext;
  selectedInterests?: Interest[];
  userInterests?: string[];
  followedOrganizers?: string[];
  favoriteSlugs?: string[];
};

export function recommendationScore(
  event: Event,
  context: PersonalizationContext
) {
  const city = cities.find((item) => item.slug === event.citySlug);
  let score = event.attendeeCount * 0.002 + event.rsvpCount * 0.004 + event.ticketSalesCount * 0.003;
  
  if (event.badges.includes("recommended")) score += 28;
  if (event.badges.includes("featured")) score += 20;
  if (event.badges.includes("trending")) score += 18;
  
  // Selected or user profile interests
  const interestsList = [...(context.selectedInterests ?? []), ...(context.userInterests ?? [])];
  if (interestsList.includes(event.category)) score += 110;
  
  // Followed organizer signal
  if (context.followedOrganizers?.includes(event.organizerSlug)) score += 85;
  
  // Favorites similarity signal
  if (context.favoriteSlugs?.includes(event.slug)) score += 50;

  // Location signals
  if (city?.countryCode === context.location.countryCode) score += 24;
  if (context.location.nearestCity?.slug === event.citySlug) score += 28;
  if (event.mode === "online") score += 10;
  if (event.mode === "global") score += 8;
  if (event.status === "cancelled") score -= 80;
  return score;
}

export function recommendedEvents(
  location: LocationContext,
  selectedInterests: Interest[],
  limit = 6,
  userContext?: { followedOrganizers?: string[]; userInterests?: string[]; favoriteSlugs?: string[] }
) {
  const context: PersonalizationContext = {
    location,
    selectedInterests,
    followedOrganizers: userContext?.followedOrganizers,
    userInterests: userContext?.userInterests,
    favoriteSlugs: userContext?.favoriteSlugs
  };

  const ranked = [...publicEvents].sort(
    (a, b) => recommendationScore(b, context) - recommendationScore(a, context)
  );

  // Apply diversity controls: max 2 per organizer, max 3 per category
  const results: Event[] = [];
  const organizerCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const event of ranked) {
    if (results.length >= limit) break;
    const orgCount = organizerCounts.get(event.organizerSlug) || 0;
    const catCount = categoryCounts.get(event.category) || 0;

    if (orgCount < 2 && catCount < 3) {
      results.push(event);
      organizerCounts.set(event.organizerSlug, orgCount + 1);
      categoryCounts.set(event.category, catCount + 1);
    }
  }

  // If diversity filter eliminated too many, fill remaining up to limit
  if (results.length < limit) {
    for (const event of ranked) {
      if (results.length >= limit) break;
      if (!results.some((r) => r.slug === event.slug)) {
        results.push(event);
      }
    }
  }

  return results;
}

export function localEventsForCountry(countryCode: string) {
  const config = configForCountry(countryCode);
  const countryCitySlugs = new Set(cities.filter((city) => city.countryCode === config.countryCode).map((city) => city.slug));
  return publicEvents.filter((event) => countryCitySlugs.has(event.citySlug) && event.mode === "local");
}
