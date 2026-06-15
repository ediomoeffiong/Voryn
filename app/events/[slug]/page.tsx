import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandNav } from "@/components/BrandNav";
import { EventCard } from "@/components/EventCard";
import { getCity, getEvent, getOrganizer, publicEvents } from "@/lib/data";
import { eventJsonLd } from "@/lib/seo";
import { CalendarDays, CheckCircle2, Link as LinkIcon, Share2, Ticket, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publicEvents.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = getEvent(slug);
  if (!event) return {};
  return {
    title: `${event.title} | Voryn`,
    description: event.summary,
    openGraph: {
      title: event.title,
      description: event.summary,
      images: [event.media.heroImage]
    }
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const event = getEvent(slug);
  if (!event) notFound();

  const city = getCity(event.citySlug);
  const organizer = getOrganizer(event.organizerSlug);
  const related = publicEvents.filter((item) => item.slug !== event.slug && item.category === event.category).slice(0, 3);
  const isCancelled = event.status === "cancelled";
  const isSoldOut = event.status === "sold-out";

  return (
    <main>
      <BrandNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(event)) }}
      />
      <section className="event-hero">
        <Image src={event.media.heroImage} alt="" fill priority sizes="100vw" />
        <div className="hero-overlay" />
        <div className="event-hero-content">
          <div>
            <p className="eyebrow">{event.category} / {event.type} / {event.mode}</p>
            <h1>{event.title}</h1>
            <p>{event.summary}</p>
          </div>
          <aside className="ticket-panel">
            <span className={`status-pill ${event.status}`}>{event.status.replace("-", " ")}</span>
            <strong>{event.priceLabel}</strong>
            <button disabled={isCancelled || isSoldOut}>
              <Ticket size={18} />
              {isCancelled ? "Cancelled" : isSoldOut ? "Join waitlist" : "Reserve spot"}
            </button>
            <small>{event.rsvpCount.toLocaleString()} RSVPs / {event.ticketSalesCount.toLocaleString()} tickets sold</small>
          </aside>
        </div>
      </section>

      {isCancelled ? (
        <section className="notice-band">
          <CheckCircle2 size={20} />
          <strong>This event has been cancelled.</strong>
          <span>Voryn keeps cancelled events visible so attendees can see updates and organizer history.</span>
        </section>
      ) : null}

      <section className="section-wrap event-detail-grid">
        <div className="event-story">
          <Image src={event.media.coverImage} alt="" width={1080} height={720} />
          <h2>Why this room matters</h2>
          <p>{event.summary} Expect curated sessions, visible community momentum, and a setting designed for people who want more than a calendar listing.</p>
          <div className="media-slots">
            <div>Gallery ready</div>
            <div>Video trailer ready</div>
            <div>Organizer media ready</div>
          </div>
        </div>
        <aside className="event-facts">
          <span><CalendarDays size={17} />{new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(new Date(event.startsAt))}</span>
          <span><Users size={17} />{event.attendeeCount.toLocaleString()} attending</span>
          <span><LinkIcon size={17} />{city?.name}, {event.country}</span>
          <span><Share2 size={17} />{event.venue}</span>
          {organizer ? (
            <Link href={`/organizers/${organizer.slug}`} className="host-card">
              <Image src={organizer.profileImage} alt="" width={54} height={54} />
              <span>
                <small>Hosted by</small>
                <strong>{organizer.name}</strong>
              </span>
            </Link>
          ) : null}
        </aside>
      </section>

      {related.length ? (
        <section className="section-wrap">
          <div className="section-heading">
            <span>More like this</span>
            <h2>Keep following the signal.</h2>
          </div>
          <div className="event-grid compact">
            {related.map((item) => <EventCard event={item} key={item.id} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
