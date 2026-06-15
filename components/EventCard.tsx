import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Flame, Users } from "lucide-react";
import { cities, getOrganizer } from "@/lib/data";
import { Event } from "@/lib/domain";

const badgeLabel: Record<string, string> = {
  featured: "Featured",
  trending: "Trending",
  recommended: "Recommended",
  "editors-pick": "Editor's pick",
  popular: "Popular",
  "recently-added": "New"
};

export function EventCard({ event, large = false }: { event: Event; large?: boolean }) {
  const city = cities.find((item) => item.slug === event.citySlug);
  const organizer = getOrganizer(event.organizerSlug);
  const primaryBadge = event.badges[0];

  return (
    <Link href={`/events/${event.slug}`} className={large ? "event-card large" : "event-card"}>
      <div className="event-image">
        <Image src={event.media.coverImage} alt="" fill sizes={large ? "58vw" : "34vw"} priority={large} />
        <div className="image-scrim" />
        {primaryBadge ? (
          <span className="momentum-badge">
            <Flame size={14} />
            {badgeLabel[primaryBadge]}
          </span>
        ) : null}
        <span className={`status-pill ${event.status}`}>{event.status.replace("-", " ")}</span>
      </div>
      <div className="event-card-body">
        <p className="eyebrow">{city?.name}, {event.country}</p>
        <h3>{event.title}</h3>
        <p>{event.summary}</p>
        <div className="metric-row">
          <span><Users size={15} />{event.attendeeCount.toLocaleString()} attending</span>
          <span><CalendarDays size={15} />{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(event.startsAt))}</span>
        </div>
        <div className="organizer-line">
          <span>{organizer?.name}</span>
          <strong>{event.priceLabel}</strong>
        </div>
      </div>
    </Link>
  );
}
