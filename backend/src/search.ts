import { cities, organizers, publicEvents } from "./data.js";
import { DiscoveryMode, Event, Interest } from "./domain.js";
import type { LocationContext } from "./personalization.js";
import { isDatabaseReady, prisma } from "./db.js";
import { publicEvent, ticketsFor } from "./events.js";

export type AdvancedSearchOptions = {
  mode?: DiscoveryMode;
  countryCode?: string;
  citySlug?: string;
  category?: string;
  type?: string;
  attendanceFormat?: string;
  priceMode?: "free" | "paid" | "all";
  from?: string;
  to?: string;
  sortBy?: "soonest" | "published" | "relevant" | "popular" | "price_asc" | "price_desc";
  page?: number;
  limit?: number;
  interests?: Interest[];
  location?: LocationContext;
};

export type SearchResultPayload = {
  query: string;
  mode?: DiscoveryMode;
  results: Event[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  suggestions: {
    categories: string[];
    cities: Array<{ name: string; slug: string; country: string }>;
  };
};

function scoreEventRelevance(event: Event, query: string, options: AdvancedSearchOptions): number {
  let score = 0;
  const q = query.toLowerCase();

  // Keyword matching weights
  if (q) {
    if (event.title.toLowerCase().includes(q)) score += 50;
    if (event.title.toLowerCase().startsWith(q)) score += 30;
    if (event.category.toLowerCase().includes(q)) score += 35;
    if (event.summary.toLowerCase().includes(q)) score += 20;
    if (event.tags && event.tags.some((t) => t.toLowerCase().includes(q))) score += 25;
    if (event.venue.toLowerCase().includes(q)) score += 15;
    if (event.country.toLowerCase().includes(q)) score += 15;
  } else {
    score += 10;
  }

  // Location context weights
  if (options.citySlug && event.citySlug === options.citySlug) score += 40;
  if (options.countryCode && event.country.toUpperCase() === options.countryCode.toUpperCase()) score += 25;
  if (options.location?.countryCode && event.country === options.location.country) score += 20;

  // Interest relevance
  if (options.interests?.includes(event.category as Interest)) score += 30;

  // Popularity & Recency signals
  score += Math.min(25, event.attendeeCount * 0.05);
  score += Math.min(20, event.rsvpCount * 0.1);
  if (event.badges.includes("featured")) score += 20;
  if (event.badges.includes("trending")) score += 15;

  return score;
}

export function searchEvents(query: string, options: AdvancedSearchOptions = {}): Event[] {
  const normalized = query.trim().toLowerCase();
  let filtered = [...publicEvents];

  // Mode filter
  if (options.mode) {
    filtered = filtered.filter((event) => event.mode === options.mode);
  }

  // City filter
  if (options.citySlug) {
    filtered = filtered.filter((event) => event.citySlug === options.citySlug);
  }

  // Category filter
  if (options.category) {
    filtered = filtered.filter((event) => event.category.toLowerCase() === options.category!.toLowerCase());
  }

  // Event Type filter
  if (options.type) {
    filtered = filtered.filter((event) => event.type.toLowerCase() === options.type!.toLowerCase());
  }

  // Attendance format (physical/online/hybrid)
  if (options.attendanceFormat) {
    filtered = filtered.filter(
      (event) => event.attendanceFormat?.toLowerCase() === options.attendanceFormat!.toLowerCase()
    );
  }

  // Price mode filter
  if (options.priceMode === "free") {
    filtered = filtered.filter((event) => event.priceLabel.toLowerCase().includes("free"));
  } else if (options.priceMode === "paid") {
    filtered = filtered.filter((event) => !event.priceLabel.toLowerCase().includes("free"));
  }

  // Date range filter
  if (options.from) {
    const fromTime = new Date(options.from).getTime();
    if (!Number.isNaN(fromTime)) {
      filtered = filtered.filter((event) => new Date(event.startsAt).getTime() >= fromTime);
    }
  }
  if (options.to) {
    const toTime = new Date(options.to).getTime();
    if (!Number.isNaN(toTime)) {
      filtered = filtered.filter((event) => new Date(event.startsAt).getTime() <= toTime);
    }
  }

  // Text search
  if (normalized) {
    filtered = filtered.filter((event) => {
      const organizer = organizers.find((item) => item.slug === event.organizerSlug);
      const city = cities.find((item) => item.slug === event.citySlug);
      const haystack = [
        event.title,
        event.category,
        event.type,
        event.country,
        (event.tags ?? []).join(" "),
        organizer?.name,
        city?.name,
        city?.country,
        city?.countryCode
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }

  // Sorting
  const sortBy = options.sortBy || "relevant";
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "soonest":
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      case "published":
        return (b.id || "").localeCompare(a.id || "");
      case "popular":
        return b.attendeeCount + b.rsvpCount - (a.attendeeCount + a.rsvpCount);
      case "price_asc":
        return (a.priceLabel.includes("Free") ? 0 : 1) - (b.priceLabel.includes("Free") ? 0 : 1);
      case "price_desc":
        return (b.priceLabel.includes("Free") ? 0 : 1) - (a.priceLabel.includes("Free") ? 0 : 1);
      case "relevant":
      default:
        return scoreEventRelevance(b, query, options) - scoreEventRelevance(a, query, options);
    }
  });

  return filtered;
}

export async function searchEventsAdvanced(
  query: string,
  options: AdvancedSearchOptions = {}
): Promise<SearchResultPayload> {
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.max(1, Math.min(Number(options.limit || 12), 100));

  let results: Event[] = [];
  let total = 0;

  if (isDatabaseReady()) {
    try {
      const now = new Date().toISOString();
      const where: Record<string, unknown> = {
        status: "published",
        deletedAt: null
      };

      if (options.from && options.to) {
        where.startsAt = { gte: options.from, lte: options.to };
      } else if (options.from) {
        where.startsAt = { gte: options.from };
      } else if (options.to) {
        where.startsAt = { lte: options.to };
      } else {
        where.startsAt = { gte: now };
      }

      if (options.mode) where.mode = options.mode;
      if (options.citySlug) where.citySlug = options.citySlug;
      if (options.category) where.category = options.category;
      if (options.type) where.type = options.type;
      if (options.attendanceFormat) where.attendanceFormat = options.attendanceFormat;
      if (options.priceMode === "free") {
        where.priceLabel = { contains: "free", mode: "insensitive" };
      } else if (options.priceMode === "paid") {
        where.NOT = { priceLabel: { contains: "free", mode: "insensitive" } };
      }

      if (query.trim()) {
        const q = query.trim();
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { venue: { contains: q, mode: "insensitive" } },
          { country: { contains: q, mode: "insensitive" } }
        ];
      }

      const [dbEvents, dbCount] = await Promise.all([
        prisma.event.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy:
            options.sortBy === "soonest"
              ? { startsAt: "asc" }
              : options.sortBy === "popular"
                ? { attendeeCount: "desc" }
                : { createdAt: "desc" }
        }),
        prisma.event.count({ where })
      ]);

      if (dbEvents.length > 0) {
        total = dbCount;
        results = await Promise.all(
          dbEvents.map(async (ev) => {
            const tickets = await ticketsFor(ev.id);
            return publicEvent(ev, tickets, false) as unknown as Event;
          })
        );
      }
    } catch {
      // Fall back to memory store if query fails
    }
  }

  // Fallback to in-memory public events if database returned empty
  if (results.length === 0) {
    const memoryResults = searchEvents(query, options);
    total = memoryResults.length;
    results = memoryResults.slice((page - 1) * limit, page * limit);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  // Category and city search suggestions
  const suggestions = {
    categories: Array.from(new Set(publicEvents.map((e) => e.category))).slice(0, 8),
    cities: cities.slice(0, 6).map((c) => ({ name: c.name, slug: c.slug, country: c.country }))
  };

  return {
    query,
    mode: options.mode,
    results,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages
    },
    suggestions
  };
}
