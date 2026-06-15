"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, MapPin, Search, Sparkles } from "lucide-react";
import { cities, organizers } from "@/lib/data";
import { DiscoveryMode } from "@/lib/domain";
import { searchEvents } from "@/lib/search";
import { DiscoverySwitch } from "./DiscoverySwitch";

export function SearchExperience() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<DiscoveryMode>("local");
  const results = useMemo(() => searchEvents(query, mode), [query, mode]);

  const suggestions = useMemo(() => {
    const text = query.toLowerCase();
    if (!text) return ["Lagos startups", "AI summit", "Online workshops", "Tokyo design"];
    return [
      ...cities.filter((city) => city.name.toLowerCase().includes(text)).map((city) => city.name),
      ...organizers.filter((org) => org.name.toLowerCase().includes(text)).map((org) => org.name)
    ].slice(0, 4);
  }, [query]);

  return (
    <section className="search-stage" aria-label="Event search">
      <div className="search-panel">
        <DiscoverySwitch active={mode} onChange={setMode} />
        <div className="search-box">
          <Search size={22} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events, organizers, cities, countries, categories..."
            aria-label="Search events"
          />
        </div>
        <div className="suggestion-row" aria-label="Instant suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => setQuery(suggestion)}>
              <Sparkles size={14} />
              {suggestion}
            </button>
          ))}
        </div>
      </div>
      <div className="live-results">
        {results.length > 0 ? (
          results.slice(0, 4).map((event) => (
            <Link href={`/events/${event.slug}`} className="result-strip" key={event.id}>
              <span className="result-thumb" style={{ backgroundImage: `url(${event.media.thumbnail})` }} />
              <span>
                <strong>{event.title}</strong>
                <small>{event.category} / {event.type} / {event.country}</small>
              </span>
              <ArrowRight size={17} />
            </Link>
          ))
        ) : (
          <div className="context-empty">
            <MapPin size={22} />
            <strong>No nearby matches yet.</strong>
            <span>Explore online events happening around the world or broaden the city.</span>
            <button onClick={() => setMode("online")}>Explore online</button>
          </div>
        )}
      </div>
      <div className="search-proof">
        <span><Building2 size={16} /> 6 global cities seeded</span>
        <span><Sparkles size={16} /> Search across title, organizer, city, country, category, and type</span>
      </div>
    </section>
  );
}
