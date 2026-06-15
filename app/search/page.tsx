import type { Metadata } from "next";
import { BrandNav } from "@/components/BrandNav";
import { EventCard } from "@/components/EventCard";
import { SearchExperience } from "@/components/SearchExperience";
import { publicEvents } from "@/lib/data";

export const metadata: Metadata = {
  title: "Search events | Voryn",
  description: "Search Voryn by event title, organizer, city, country, category, and event type."
};

export default function SearchPage() {
  return (
    <main>
      <BrandNav />
      <section className="search-page-hero">
        <div>
          <p className="eyebrow">Search</p>
          <h1>Find the next room before everyone else does.</h1>
          <p>Search across cities, countries, organizers, categories, online events, and travel-worthy global experiences.</p>
        </div>
        <SearchExperience />
      </section>
      <section className="section-wrap">
        <div className="section-heading">
          <span>Recommended</span>
          <h2>High-momentum events to start from.</h2>
        </div>
        <div className="event-grid">
          {publicEvents.slice(0, 3).map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
