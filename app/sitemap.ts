import type { MetadataRoute } from "next";
import { cities, organizers, publicEvents } from "@/lib/data";

const baseUrl = "https://voryn.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/search`, lastModified: new Date() },
    ...cities.map((city) => ({
      url: `${baseUrl}/${city.slug}`,
      lastModified: new Date()
    })),
    ...publicEvents.map((event) => ({
      url: `${baseUrl}/events/${event.slug}`,
      lastModified: new Date(event.startsAt)
    })),
    ...organizers.map((organizer) => ({
      url: `${baseUrl}/organizers/${organizer.slug}`,
      lastModified: new Date()
    }))
  ];
}
