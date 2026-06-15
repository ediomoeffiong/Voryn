import { BrandNav } from "@/components/BrandNav";
import { EventCard } from "@/components/EventCard";
import { OrganizerStrip } from "@/components/OrganizerStrip";
import { SearchExperience } from "@/components/SearchExperience";
import { cities, organizers, publicEvents } from "@/lib/data";
import { getHomepageMetrics, getModeCollections } from "@/lib/discovery";
import { ArrowRight, BadgeCheck, Globe2, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const heroEvent = publicEvents[0];
  const featured = publicEvents.filter((event) => event.badges.includes("featured"));
  const trending = publicEvents.filter((event) => event.badges.includes("trending"));
  const metrics = getHomepageMetrics();
  const modeCollections = getModeCollections();

  return (
    <main>
      <BrandNav />
      <section className="home-hero">
        <Image src={heroEvent.media.heroImage} alt="" fill priority sizes="100vw" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Local / Online / Global</p>
            <h1>Find the rooms where momentum is already happening.</h1>
            <p>
              Voryn turns event discovery into a visual feed of active communities, creator-led organizers,
              and travel-worthy experiences.
            </p>
            <Link href={`/events/${heroEvent.slug}`} className="hero-link">
              Explore featured event <ArrowRight size={18} />
            </Link>
          </div>
          <SearchExperience />
        </div>
      </section>

      <section className="section-wrap city-rail-section">
        <div className="section-heading">
          <span><Globe2 size={17} /> City architecture</span>
          <h2>Built for thousands of local discovery pages.</h2>
        </div>
        <div className="city-rail">
          {cities.map((city) => (
            <Link href={`/${city.slug}`} className="city-tile" key={city.id}>
              <Image src={city.heroImage} alt="" fill sizes="24vw" />
              <span>{city.name}</span>
              <small>{city.country}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading split">
          <div>
            <span><BadgeCheck size={17} /> Featured system</span>
            <h2>Showcase events with monetizable editorial surfaces.</h2>
          </div>
          <Link href="/lagos">Start in Lagos <ArrowRight size={17} /></Link>
        </div>
        <div className="event-grid">
          {featured.map((event, index) => <EventCard event={event} large={index === 0} key={event.id} />)}
        </div>
      </section>

      <section className="section-wrap momentum-band">
        <div className="section-heading">
          <span><MapPin size={17} /> Social proof</span>
          <h2>Discovery shaped by activity, demand, and trust.</h2>
        </div>
        <div className="metric-cards">
          <div><strong>{(metrics.attendees / 1000).toFixed(1)}K</strong><span>attendees visible across public events</span></div>
          <div><strong>{(metrics.rsvps / 1000).toFixed(1)}K</strong><span>RSVPs powering trending signals</span></div>
          <div><strong>{(metrics.tickets / 1000).toFixed(1)}K</strong><span>tickets sold across featured inventory</span></div>
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Discovery modes</span>
          <h2>Three ways to enter the same global graph.</h2>
        </div>
        <div className="mode-story-grid">
          {modeCollections.map((collection) => (
            <Link href={collection.topCity ? `/${collection.topCity.slug}` : "/"} className="mode-story" key={collection.mode}>
              <strong>{collection.mode}</strong>
              <span>{collection.events.length} live surfaces</span>
              <small>{collection.topCity ? `${collection.topCity.name}, ${collection.topCity.country}` : "Global feed"}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading split">
          <div>
            <span>Creator profiles</span>
            <h2>Organizers feel like people and media brands.</h2>
          </div>
        </div>
        <OrganizerStrip organizers={organizers} />
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Trending now</span>
          <h2>Fast routes into what people are already joining.</h2>
        </div>
        <div className="event-grid compact">
          {trending.map((event) => <EventCard event={event} key={event.id} />)}
        </div>
      </section>
    </main>
  );
}
