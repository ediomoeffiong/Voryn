import { cities, getCity, getOrganizer, organizers, publicEvents } from "./data.js";
import { Event } from "./domain.js";
import type { TicketType } from "@prisma/client";

export function eventJsonLd(event: Event, tickets: TicketType[] = []) {
  const city = getCity(event.citySlug);
  const organizer = getOrganizer(event.organizerSlug);
  const attendanceMode =
    event.mode === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.mode === "global"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";

  const offers = tickets.length
    ? tickets.map((t) => ({
        "@type": "Offer",
        name: t.name,
        description: t.description || undefined,
        price: (t.priceMinor / 100).toFixed(2),
        priceCurrency: t.currency || "NGN",
        availability:
          t.availability === "sold_out" || (t.capacity !== null && t.reservedCount >= t.capacity)
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
        validFrom: t.salesOpenAt?.toISOString(),
        validThrough: t.salesCloseAt?.toISOString(),
        url: `https://voryn.com/events/${event.slug}`
      }))
    : [
        {
          "@type": "Offer",
          name: "General Admission",
          price: "0.00",
          priceCurrency: "NGN",
          availability: "https://schema.org/InStock",
          url: `https://voryn.com/events/${event.slug}`
        }
      ];

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventAttendanceMode: attendanceMode,
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : event.status === "completed"
          ? "https://schema.org/EventCompleted"
          : "https://schema.org/EventScheduled",
    image: [event.media?.heroImage, event.media?.coverImage, event.media?.thumbnail].filter(Boolean),
    location:
      event.mode === "online"
        ? { "@type": "VirtualLocation", url: `https://voryn.com/events/${event.slug}` }
        : {
            "@type": "Place",
            name: event.venue,
            address: {
              "@type": "PostalAddress",
              addressLocality: city?.name,
              addressCountry: city?.countryCode
            }
          },
    organizer: organizer
      ? {
          "@type": "Organization",
          name: organizer.name,
          url: `https://voryn.com/organizers/${organizer.slug}`
        }
      : undefined,
    offers
  };
}

export function generateSitemapXml(baseUrl = "https://voryn.com"): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const now = new Date().toISOString().split("T")[0];

  const urls: Array<{ loc: string; lastmod?: string; changefreq: string; priority: string }> = [
    { loc: `${cleanBase}/`, lastmod: now, changefreq: "daily", priority: "1.0" },
    { loc: `${cleanBase}/search`, lastmod: now, changefreq: "daily", priority: "0.9" },
    { loc: `${cleanBase}/search?mode=online`, lastmod: now, changefreq: "daily", priority: "0.8" },
    { loc: `${cleanBase}/search?mode=global`, lastmod: now, changefreq: "daily", priority: "0.8" }
  ];

  // Cities
  for (const city of cities) {
    urls.push({
      loc: `${cleanBase}/${city.slug}`,
      lastmod: now,
      changefreq: "weekly",
      priority: "0.8"
    });
  }

  // Organizers
  for (const org of organizers) {
    urls.push({
      loc: `${cleanBase}/organizers/${org.slug}`,
      lastmod: now,
      changefreq: "weekly",
      priority: "0.7"
    });
  }

  // Events
  for (const ev of publicEvents) {
    if (ev.status === "published") {
      urls.push({
        loc: `${cleanBase}/events/${ev.slug}`,
        lastmod: now,
        changefreq: "hourly",
        priority: "0.9"
      });
    }
  }

  const urlTags = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlTags}
</urlset>`;
}

export function generateRobotsTxt(baseUrl = "https://voryn.com"): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `User-agent: *
Allow: /
Allow: /events/
Allow: /organizers/
Allow: /search
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Disallow: /checkout/

Sitemap: ${cleanBase}/sitemap.xml
`;
}
