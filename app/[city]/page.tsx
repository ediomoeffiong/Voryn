import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandNav } from "@/components/BrandNav";
import { EventCard } from "@/components/EventCard";
import { OrganizerStrip } from "@/components/OrganizerStrip";
import { cities } from "@/lib/data";
import { getCityDiscoveryModel } from "@/lib/discovery";
import { CalendarClock, Flame, MapPinned, Tags } from "lucide-react";
import Image from "next/image";

type Props = { params: Promise<{ city: string }> };

export function generateStaticParams() {
  return cities.map((city) => ({ city: city.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const model = getCityDiscoveryModel(citySlug);
  if (!model) return {};

  return {
    title: `${model.city.name} events | Voryn`,
    description: `Discover featured, trending, local organizer, category, and upcoming events in ${model.city.name}.`
  };
}

export default async function CityPage({ params }: Props) {
  const { city: citySlug } = await params;
  const model = getCityDiscoveryModel(citySlug);
  if (!model) notFound();

  const { city } = model;
  const visibleEvents = model.upcomingEvents.length ? model.upcomingEvents : model.fallbackEvents;
  const categories = model.categories.length ? model.categories : [...new Set(visibleEvents.map((event) => event.category))];
  const localOrganizers = model.localOrganizers.length ? model.localOrganizers : [];

  return (
    <main>
      <BrandNav />
      <section className="city-hero">
        <Image src={city.heroImage} alt="" fill priority sizes="100vw" />
        <div className="hero-overlay" />
        <div className="city-hero-content">
          <p className="eyebrow">{city.region} / {city.country}</p>
          <h1>{city.name}</h1>
          <p>Featured gatherings, local momentum, standout organizers, and online escapes when the city is quiet.</p>
        </div>
      </section>

      <section className="section-wrap city-dashboard">
        <div className="city-stat"><Flame size={19} /><strong>{model.trendingEvents.length}</strong><span>Trending</span></div>
        <div className="city-stat"><CalendarClock size={19} /><strong>{visibleEvents.length}</strong><span>Upcoming</span></div>
        <div className="city-stat"><Tags size={19} /><strong>{categories.length}</strong><span>Categories</span></div>
        <div className="city-stat"><MapPinned size={19} /><strong>{city.timezone}</strong><span>Timezone</span></div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Featured events</span>
          <h2>{model.upcomingEvents.length ? `The sharpest rooms in ${city.name}.` : `No local events yet. Explore online events around the world.`}</h2>
        </div>
        <div className="event-grid">
          {visibleEvents.map((event, index) => <EventCard event={event} large={index === 0} key={event.id} />)}
        </div>
      </section>

      <section className="section-wrap category-band">
        <div className="section-heading">
          <span>Categories</span>
          <h2>Move by intent, not by database rows.</h2>
        </div>
        <div className="category-pills">
          {categories.map((category) => <span key={category}>{category}</span>)}
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Local organizers</span>
          <h2>Follow the creators shaping this city.</h2>
        </div>
        {localOrganizers.length ? <OrganizerStrip organizers={localOrganizers} /> : (
          <div className="context-empty city-empty">
            <strong>No local organizer has claimed this city yet.</strong>
            <span>Voryn can still route visitors into online events while the local graph grows.</span>
          </div>
        )}
      </section>
    </main>
  );
}
