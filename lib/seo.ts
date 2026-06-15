import { getCity, getOrganizer } from "./data";
import { Event } from "./domain";

export function eventJsonLd(event: Event) {
  const city = getCity(event.citySlug);
  const organizer = getOrganizer(event.organizerSlug);
  const attendanceMode =
    event.mode === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.mode === "global"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    startDate: event.startsAt,
    eventAttendanceMode: attendanceMode,
    eventStatus:
      event.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : event.status === "completed"
          ? "https://schema.org/EventCompleted"
          : "https://schema.org/EventScheduled",
    image: [event.media.heroImage, event.media.coverImage, event.media.thumbnail],
    location:
      event.mode === "online"
        ? { "@type": "VirtualLocation", url: "https://voryn.com/search" }
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
      : undefined
  };
}
