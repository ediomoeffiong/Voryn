import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  CalendarPlus,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Compass,
  Download,
  DollarSign,
  Edit3,
  ExternalLink,
  Flame,
  Globe2,
  Heart,
  Link as LinkIcon,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  MapPinned,
  MonitorPlay,
  Plus,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Tags,
  Ticket,
  Trash2,
  Users,
  UsersRound,
  XCircle
} from "lucide-react";
import {
  adminLogin,
  changePassword,
  confirmPasswordReset,
  createOrganizerEvent,
  decideRegistration,
  deleteOrganizerEvent,
  duplicateOrganizerEvent,
  downloadTicket,
  exportAttendees,
  favoriteEvent,
  followOrganizerFromDashboard,
  followOrganizer,
  getAdminDashboard,
  getCity,
  getEvent,
  getHome,
  getMe,
  getOrganizer,
  getOrganizerDashboard,
  getParticipantDashboard,
  leaveReview,
  login,
  logoutSession,
  registerForEvent,
  searchEvents,
  sendAnnouncement,
  signup,
  switchDashboard,
  transitionOrganizerEvent,
  updateNotifications,
  updateOrganizerEvent,
  updateOrganizerProfile,
  updateParticipantProfile,
  removeFavoriteEvent,
  requestPasswordReset,
  cancelRegistrationForEvent,
  advancedSearch
} from "./api";
import type {
  AdminDashboard,
  CityDiscoveryModel,
  DiscoveryMode,
  Event,
  EventStatus,
  HomePayload,
  Interest,
  NavigationItem,
  Organizer,
  OrganizerDashboard,
  ParticipantDashboard,
  Role,
  User
} from "./types";
import { EventBuilder } from "./EventBuilder";
import { Stage3Dashboard } from "./Stage3Dashboard";
import { CheckoutModal, CheckoutCallbackPage, SocialShareModal } from "./Checkout";

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

function ImageSlider({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const prevSlide = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const nextSlide = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="image-slider">
      <button onClick={prevSlide} className="slider-arrow prev" aria-label="Previous image">
        &#10094;
      </button>
      <div className="slider-track" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
        {images.map((img, idx) => (
          <div className="slider-slide" key={idx}>
            <img src={img} alt={`Slide ${idx + 1}`} />
          </div>
        ))}
      </div>
      <button onClick={nextSlide} className="slider-arrow next" aria-label="Next image">
        &#10095;
      </button>
      <div className="slider-dots">
        {images.map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={`slider-dot ${idx === currentIndex ? "active" : ""}`}
            onClick={(e) => { e.preventDefault(); setCurrentIndex(idx); }}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, deps);

  return { data, error, loading };
}

const defaultNavigation: NavigationItem[] = [
  { label: "Near You", href: "/search?scope=near-you", kind: "nearby" },
  { label: "Lagos", href: "/lagos", kind: "capital" },
  { label: "Abuja", href: "/abuja", kind: "capital" },
  { label: "Global", href: "/search?mode=global", kind: "global" }
];

function useStoredInterests() {
  const [interests, setInterests] = useState<Interest[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("voryn:interests") ?? "[]") as Interest[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("voryn:interests", JSON.stringify(interests));
  }, [interests]);

  return [interests, setInterests] as const;
}

function useBrowserCoordinates() {
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>();

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setCoordinates(undefined),
      { enableHighAccuracy: false, maximumAge: 1000 * 60 * 30, timeout: 4500 }
    );
  }, []);

  return coordinates;
}

function useAuthSession() {
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    getMe().then((result) => { if (active) setUser(result.user); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setInitialized(true); });
    return () => { active = false; };
  }, []);

  const setAuth = (_nextToken: string, nextUser: User) => {
    setUser(nextUser);
  };

  const logout = () => {
    setUser(null);
    void logoutSession();
  };

  return { token: user ? "cookie-session" : "", user, setAuth, logout, initialized };
}

function money(value: number | null) {
  if (value === null) return "Not configured";
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function BrandNav({ navigation = defaultNavigation }: { navigation?: NavigationItem[] }) {
  const auth = useAuthSession();
  const isLoggedIn = Boolean(auth.user && auth.token);
  const destination = auth.user ? dashboardPath(auth.user) : "/attendee";

  return (
    <header className="nav-shell">
      <Link to="/" className="brand-mark" aria-label="Voryn home">
        <span>V</span>
        Voryn
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link to={item.href} key={`${item.kind}-${item.label}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="nav-actions">
        <Link to="/search" className="icon-button" aria-label="Open search">
          <Search size={18} />
        </Link>
        <Link to={isLoggedIn ? destination : "/organizer"} className="solid-button">
          {isLoggedIn ? <Compass size={18} /> : <Shield size={18} />}
          {isLoggedIn ? "Dashboard" : "Sign In"}
        </Link>
      </div>
    </header>
  );
}

const modes: { value: DiscoveryMode; label: string; icon: React.ElementType }[] = [
  { value: "local", label: "Local", icon: MapPin },
  { value: "online", label: "Online", icon: MonitorPlay },
  { value: "global", label: "Global", icon: Globe2 }
];

function DiscoverySwitch({ active, onChange }: { active: DiscoveryMode; onChange: (mode: DiscoveryMode) => void }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Discovery mode">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            className={active === mode.value ? "active" : ""}
            onClick={() => onChange(mode.value)}
            role="tab"
            aria-selected={active === mode.value}
          >
            <Icon size={17} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

const badgeLabel: Record<string, string> = {
  featured: "Featured",
  trending: "Trending",
  recommended: "Recommended",
  "editors-pick": "Editor's pick",
  popular: "Popular",
  "recently-added": "New"
};

function EventCard({ event, large = false }: { event: Event; large?: boolean }) {
  const primaryBadge = event.badges[0];

  return (
    <Link to={`/events/${event.slug}`} className={large ? "event-card large" : "event-card"}>
      <div className="event-image">
        <img src={event.media.coverImage} alt="" />
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
        <p className="eyebrow">{event.country}</p>
        <h3>{event.title}</h3>
        <p>{event.summary}</p>
        <div className="metric-row">
          <span>
            <Users size={15} />
            {event.attendeeCount.toLocaleString()} attending
          </span>
          <span>
            <CalendarDays size={15} />
            {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(event.startsAt))}
          </span>
        </div>
        <div className="organizer-line">
          <span>{event.category}</span>
          <strong>{event.priceLabel}</strong>
        </div>
      </div>
    </Link>
  );
}

function SearchExperience({
  interests = [],
  countryCode,
  initialMode = "local"
}: {
  interests?: Interest[];
  countryCode?: string;
  initialMode?: DiscoveryMode;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<DiscoveryMode>(initialMode);
  const [results, setResults] = useState<Event[]>([]);
  const [priceFilter, setPriceFilter] = useState<"any" | "free" | "paid">("any");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"published" | "popular" | "soonest" | "relevant" | "price_asc" | "price_desc">("soonest");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let active = true;
    advancedSearch({
      q: query || undefined,
      mode,
      category: categoryFilter || undefined,
      priceMode: priceFilter === "any" ? undefined : priceFilter,
      sortBy,
      countryCode
    }).then((payload) => {
      if (active) setResults(payload.results);
    }).catch(() => {
      if (active) {
        searchEvents(query, mode, { countryCode, interests }).then((p) => setResults(p.results)).catch(() => {});
      }
    });
    return () => {
      active = false;
    };
  }, [query, mode, countryCode, categoryFilter, priceFilter, sortBy, interests.join(",")]);

  const suggestions = useMemo(() => {
    if (!query) return ["Lagos startups", "AI summit", "Online workshops", "Canada career"];
    return ["Nigeria", "United States", "United Kingdom", "Canada", "Technology", "Global"].filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    );
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
        <div className="filter-row" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", alignItems: "center" }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)", background: "var(--card-bg, #fff)", color: "inherit", fontSize: "0.85rem" }}
            aria-label="Category filter"
          >
            <option value="">All Categories</option>
            <option value="Technology">Technology</option>
            <option value="Design">Design</option>
            <option value="Startup">Startup</option>
            <option value="Community">Community</option>
            <option value="Leadership">Leadership</option>
            <option value="Creative">Creative</option>
          </select>

          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as "any" | "free" | "paid")}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)", background: "var(--card-bg, #fff)", color: "inherit", fontSize: "0.85rem" }}
            aria-label="Price filter"
          >
            <option value="any">All Prices</option>
            <option value="free">Free Events</option>
            <option value="paid">Paid Tickets</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "soonest" | "relevant" | "popular")}
            style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #e2e8f0)", background: "var(--card-bg, #fff)", color: "inherit", fontSize: "0.85rem" }}
            aria-label="Sort events"
          >
            <option value="soonest">Date: Soonest First</option>
            <option value="relevant">Relevance</option>
            <option value="popular">Most Popular</option>
          </select>

          {(categoryFilter || priceFilter !== "any" || sortBy !== "soonest") ? (
            <button
              onClick={() => { setCategoryFilter(""); setPriceFilter("any"); setSortBy("soonest"); }}
              style={{ padding: "4px 8px", fontSize: "0.8rem", borderRadius: "6px", background: "none", border: "1px solid var(--border-color, #cbd5e1)", cursor: "pointer" }}
            >
              Reset Filters
            </button>
          ) : null}
        </div>
      </div>
      <div className="live-results">
        {results.length > 0 ? (
          results.slice(0, 4).map((event) => (
            <Link to={`/events/${event.slug}`} className="result-strip" key={event.id}>
              <span className="result-thumb" style={{ backgroundImage: `url(${event.media.thumbnail})` }} />
              <span>
                <strong>{event.title}</strong>
                <small>
                  {event.category} / {event.type} / {event.country}
                </small>
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
        <span>
          <Building2 size={16} /> Backend search API
        </span>
        <span>
          <Sparkles size={16} /> Title, organizer, city, country, category, and type
        </span>
      </div>
    </section>
  );
}

function InterestPreferences({
  available,
  selected,
  onChange
}: {
  available: Interest[];
  selected: Interest[];
  onChange: (interests: Interest[]) => void;
}) {
  const toggle = (interest: Interest) => {
    onChange(selected.includes(interest) ? selected.filter((item) => item !== interest) : [...selected, interest]);
  };

  return (
    <section className="section-wrap preference-section">
      <div className="section-heading split">
        <div>
          <span>
            <Sparkles size={17} /> Preferences
          </span>
          <h2>Choose interests and Voryn reshapes the feed around you.</h2>
        </div>
        {selected.length ? (
          <button className="clear-preferences" onClick={() => onChange([])}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="interest-grid" aria-label="Interest preferences">
        {available.map((interest) => {
          const active = selected.includes(interest);
          return (
            <button className={active ? "active" : ""} key={interest} onClick={() => toggle(interest)}>
              {active ? <CheckCircle2 size={16} /> : <Tags size={16} />}
              {interest}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OrganizerStrip({ organizers }: { organizers: Organizer[] }) {
  return (
    <div className="organizer-grid">
      {organizers.map((organizer) => (
        <Link to={`/organizers/${organizer.slug}`} className="organizer-card" key={organizer.id}>
          <img src={organizer.coverImage} alt="" />
          <div className="organizer-card-content">
            <img src={organizer.profileImage} alt="" width={64} height={64} />
            <span>
              <strong>{organizer.name}</strong>
              <small>
                <UsersRound size={14} />
                {organizer.followers.toLocaleString()} followers
              </small>
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <main>
      <BrandNav />
      <section className="search-page-hero">
        <div>
          <p className="eyebrow">Loading</p>
          <h1>Gathering the room.</h1>
          <p>Voryn is pulling live discovery data from the backend.</p>
        </div>
      </section>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main>
      <BrandNav />
      <section className="search-page-hero">
        <div className="context-empty">
          <strong>The backend did not answer.</strong>
          <span>{message}. Start the API with npm run dev --workspace backend.</span>
        </div>
      </section>
    </main>
  );
}

function Home() {
  const [interests, setInterests] = useStoredInterests();
  const coordinates = useBrowserCoordinates();
  const { data, error, loading } = useAsync<HomePayload>(
    () => getHome({ coordinates, interests }),
    [coordinates?.lat, coordinates?.lng, interests.join(",")]
  );

  useEffect(() => {
    document.title = "Voryn | Discover events with momentum";
  }, []);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "No homepage data"} />;

  return (
    <main>
      <BrandNav navigation={data.navigation} />
      <section className="home-hero">
        <img src={data.heroEvent.media.heroImage} alt="" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">
              {data.location.source === "default" ? "Nigeria by default" : `${data.location.country} events`}
            </p>
            <h1>Find the rooms where momentum is already happening.</h1>
            <p>
              Voryn turns event discovery into a visual feed of active communities, creator-led organizers,
              and travel-worthy experiences.
            </p>
            <Link to={`/events/${data.heroEvent.slug}`} className="hero-link">
              Explore featured event <ArrowRight size={18} />
            </Link>
          </div>
          <SearchExperience interests={interests} countryCode={data.location.countryCode} />
        </div>
      </section>

      <section className="section-wrap event-menu-section">
        <div className="section-heading">
          <span>
            <MapPinned size={17} /> Event navigation
          </span>
          <h2>{data.location.source === "default" ? "Starting with Nigerian events for every new visitor." : `Discovery tuned for ${data.location.country}.`}</h2>
        </div>
        <div className="event-menu-grid">
          {data.navigation.map((item) => (
            <Link to={item.href} className="event-menu-card" key={`${item.kind}-${item.label}`}>
              <strong>{item.label}</strong>
              <span>
                {item.kind === "nearby"
                  ? "Nearby cities and regions first"
                  : item.kind === "global"
                    ? "International and virtual events"
                    : "Capital city discovery"}
              </span>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      </section>

      <InterestPreferences available={data.interests} selected={interests} onChange={setInterests} />

      <section className="section-wrap">
        <div className="section-heading">
          <span>
            <Sparkles size={17} /> Recommended For You
          </span>
          <h2>{interests.length ? "Ranked by your interests, location, and event momentum." : "Pick interests to sharpen these recommendations."}</h2>
        </div>
        <div className="event-grid">
          {data.recommended.slice(0, 3).map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>

      <section className="section-wrap city-rail-section">
        <div className="section-heading">
          <span>
            <Globe2 size={17} /> City architecture
          </span>
          <h2>Built for thousands of local discovery pages.</h2>
        </div>
        <div className="city-rail">
          {data.cities.map((city) => (
            <Link to={`/${city.slug}`} className="city-tile" key={city.id}>
              <img src={city.heroImage} alt="" />
              <span>{city.name}</span>
              <small>{city.country}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading split">
          <div>
            <span>
              <MapPin size={17} /> Near You
            </span>
            <h2>Nearby cities and regions appear first.</h2>
          </div>
          <Link to={data.navigation[0]?.href ?? "/search"}>
            Explore near you <ArrowRight size={17} />
          </Link>
        </div>
        <div className="event-grid">
          {(data.nearby.length ? data.nearby : data.countryEvents).slice(0, 3).map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>

      <section className="section-wrap momentum-band">
        <div className="section-heading">
          <span>
            <MapPin size={17} /> Social proof
          </span>
          <h2>Discovery shaped by activity, demand, and trust.</h2>
        </div>
        <div className="metric-cards">
          <div>
            <strong>{(data.metrics.attendees / 1000).toFixed(1)}K</strong>
            <span>attendees visible across public events</span>
          </div>
          <div>
            <strong>{(data.metrics.rsvps / 1000).toFixed(1)}K</strong>
            <span>RSVPs powering trending signals</span>
          </div>
          <div>
            <strong>{(data.metrics.tickets / 1000).toFixed(1)}K</strong>
            <span>tickets sold across featured inventory</span>
          </div>
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Global events</span>
          <h2>Major international and virtual events remain within reach.</h2>
        </div>
        <div className="event-grid compact">
          {data.global.slice(0, 4).map((event) => (
            <EventCard event={event} key={event.id} />
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
        <OrganizerStrip organizers={data.organizers} />
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Trending now</span>
          <h2>Fast routes into what people are already joining.</h2>
        </div>
        <div className="event-grid compact">
          {data.trending.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  );
}

function SearchPage() {
  const [params] = useSearchParams();
  const [interests] = useStoredInterests();
  const coordinates = useBrowserCoordinates();
  const initialMode = params.get("mode") === "global" ? "global" : params.get("mode") === "online" ? "online" : "local";
  const { data, error, loading } = useAsync<HomePayload>(
    () => getHome({ coordinates, interests }),
    [coordinates?.lat, coordinates?.lng, interests.join(",")]
  );

  useEffect(() => {
    document.title = "Search events | Voryn";
  }, []);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "No search data"} />;

  return (
    <main>
      <BrandNav navigation={data.navigation} />
      <section className="search-page-hero">
        <div>
          <p className="eyebrow">Search</p>
          <h1>Find the next room before everyone else does.</h1>
          <p>Search across cities, countries, organizers, categories, online events, and travel-worthy global experiences.</p>
        </div>
        <SearchExperience interests={interests} countryCode={data.location.countryCode} initialMode={initialMode} />
      </section>
      <section className="section-wrap">
        <div className="section-heading">
          <span>Recommended</span>
          <h2>High-momentum events to start from.</h2>
        </div>
        <div className="event-grid">
          {data.recommended.slice(0, 3).map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CityPage() {
  const { city = "" } = useParams();
  const { data, error, loading } = useAsync<CityDiscoveryModel>(() => getCity(city), [city]);
  const navigate = useNavigate();

  useEffect(() => {
    if (data) document.title = `${data.city.name} events | Voryn`;
  }, [data]);

  useEffect(() => {
    if (error && (error.includes("404") || error.toLowerCase().includes("not found"))) {
      navigate("/404", { replace: true });
    }
  }, [error, navigate]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "City not found"} />;

  const visibleEvents = data.upcomingEvents.length ? data.upcomingEvents : data.fallbackEvents;
  const categories = data.categories.length ? data.categories : [...new Set(visibleEvents.map((event) => event.category))];

  return (
    <main>
      <BrandNav />
      <section className="city-hero">
        <img src={data.city.heroImage} alt="" />
        <div className="hero-overlay" />
        <div className="city-hero-content">
          <p className="eyebrow">
            {data.city.region} / {data.city.country}
          </p>
          <h1>{data.city.name}</h1>
          <p>Featured gatherings, local momentum, standout organizers, and online escapes when the city is quiet.</p>
        </div>
      </section>

      <section className="section-wrap city-dashboard">
        <div className="city-stat">
          <Flame size={19} />
          <strong>{data.trendingEvents.length}</strong>
          <span>Trending</span>
        </div>
        <div className="city-stat">
          <CalendarClock size={19} />
          <strong>{visibleEvents.length}</strong>
          <span>Upcoming</span>
        </div>
        <div className="city-stat">
          <Tags size={19} />
          <strong>{categories.length}</strong>
          <span>Categories</span>
        </div>
        <div className="city-stat">
          <MapPinned size={19} />
          <strong>{data.city.timezone}</strong>
          <span>Timezone</span>
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Featured events</span>
          <h2>{data.upcomingEvents.length ? `The sharpest rooms in ${data.city.name}.` : "No local events yet. Explore online events around the world."}</h2>
        </div>
        <div className="event-grid">
          {visibleEvents.map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>

      <section className="section-wrap category-band">
        <div className="section-heading">
          <span>Categories</span>
          <h2>Move by intent, not by database rows.</h2>
        </div>
        <div className="category-pills">{categories.map((category) => <span key={category}>{category}</span>)}</div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>Local organizers</span>
          <h2>Follow the creators shaping this city.</h2>
        </div>
        {data.localOrganizers.length ? (
          <OrganizerStrip organizers={data.localOrganizers} />
        ) : (
          <div className="context-empty city-empty">
            <strong>No local organizer has claimed this city yet.</strong>
            <span>Voryn can still route visitors into online events while the local graph grows.</span>
          </div>
        )}
      </section>
    </main>
  );
}

function EventPage() {
  const { slug = "" } = useParams();
  const auth = useAuthSession();
  const { data, error, loading } = useAsync(() => getEvent(slug, auth.token || undefined), [slug, auth.token]);
  const navigate = useNavigate();

  useEffect(() => {
    if (data) document.title = `${data.event.title} | Voryn`;
  }, [data]);

  useEffect(() => {
    if (error && (error.includes("404") || error.toLowerCase().includes("not found"))) {
      navigate("/404", { replace: true });
    }
  }, [error, navigate]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "Event not found"} />;

  return <EventPageContent data={data} />;
}

function EventPageContent({ data }: { data: { event: Event; related: Event[]; jsonLd: unknown; isRegistered?: boolean } }) {
  const { event, related } = data;
  const [liveEvent, setLiveEvent] = useState(event);
  const [isRegistered, setIsRegistered] = useState(data.isRegistered ?? false);
  const [ticketAction, setTicketAction] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedTicketTier, setSelectedTicketTier] = useState<string | undefined>();
  const [isShareOpen, setIsShareOpen] = useState(false);
  const auth = useAuthSession();
  const navigate = useNavigate();
  const canUseAttendeeActions = Boolean(auth.user && auth.token && auth.user.role !== "admin");
  const shownEvent = liveEvent.slug === event.slug ? liveEvent : event;
  const isCancelled = event.status === "cancelled";
  const isSoldOut = event.status === "sold-out" || (event.capacity !== null && event.capacity !== undefined && event.reservedCount >= event.capacity);
  const registrationMode = event.registration?.mode ?? "free";
  const registrationDisabled = isCancelled || isSoldOut || registrationMode === "disabled";
  const calendarStart = new Date(shownEvent.startsAt);
  const calendarEnd = shownEvent.endsAt ? new Date(shownEvent.endsAt) : new Date(calendarStart.getTime() + 2 * 60 * 60 * 1000);
  const calendarStamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const googleCalendar = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: shownEvent.title,
    details: shownEvent.summary,
    location: shownEvent.venue,
    dates: `${calendarStamp(calendarStart)}/${calendarStamp(calendarEnd)}`
  }).toString()}`;
  const outlookCalendar = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&${new URLSearchParams({
    subject: shownEvent.title,
    body: shownEvent.summary,
    location: shownEvent.venue,
    startdt: calendarStart.toISOString(),
    enddt: calendarEnd.toISOString()
  }).toString()}`;

  return (
    <main>
      <BrandNav />
      <script type="application/ld+json">{JSON.stringify(data.jsonLd)}</script>
      <section className="event-hero">
        <img src={shownEvent.media.heroImage} alt="" />
        <div className="hero-overlay" />
        <div className="event-hero-content">
          <div>
            <p className="eyebrow">
              {shownEvent.category} / {shownEvent.type} / {shownEvent.mode}
            </p>
            <h1>{shownEvent.title}</h1>
            <p>{shownEvent.summary}</p>
          </div>
          <aside className="ticket-panel">
            <span className={`status-pill ${shownEvent.status}`}>{shownEvent.status.replace("-", " ")}</span>
            <strong>{shownEvent.priceLabel}</strong>
            <button
              disabled={registrationDisabled && !isRegistered}
              onClick={async () => {
                if (registrationMode === "paid") {
                  if (!auth.token) {
                    navigate("/login");
                  } else {
                    setSelectedTicketTier(undefined);
                    setIsCheckoutOpen(true);
                  }
                  return;
                }
                if (canUseAttendeeActions && auth.token) {
                  if (isRegistered) {
                    await cancelRegistrationForEvent(auth.token, shownEvent.slug);
                    setIsRegistered(false);
                    setTicketAction("Registration cancelled");
                  } else {
                    const result = await registerForEvent(auth.token, shownEvent.slug);
                    const updated = result.dashboard.history.find((item) => item.slug === shownEvent.slug);
                    if (updated) setLiveEvent(updated);
                    setIsRegistered(true);
                    setTicketAction("Registered with reminders");
                  }
                } else {
                  setTicketAction("Sign in to register for this event");
                  navigate("/login");
                }
              }}
            >
              {isRegistered ? <XCircle size={18} /> : <Ticket size={18} />}
              {isCancelled ? "Cancelled" : registrationMode === "paid" ? "Get Tickets" : registrationMode === "disabled" ? "Registration closed" : isSoldOut ? "Sold out" : canUseAttendeeActions ? (isRegistered ? "Cancel Registration" : "Register") : "Reserve spot"}
            </button>
            {canUseAttendeeActions && auth.token ? (
              auth.user?.favorites.includes(shownEvent.slug) ? (
                <button
                  className="secondary"
                  onClick={async () => {
                    const result = await removeFavoriteEvent(auth.token!, shownEvent.slug);
                    auth.setAuth(auth.token!, result.user);
                    setTicketAction("Event unsaved");
                  }}
                >
                  <Heart size={18} fill="currentColor" className="heart-icon-filled" /> Unsave
                </button>
              ) : (
                <button
                  className="secondary"
                  onClick={async () => {
                    const result = await favoriteEvent(auth.token!, shownEvent.slug);
                    auth.setAuth(auth.token!, result.user);
                    setTicketAction("Event saved");
                  }}
                >
                  <Heart size={18} /> Save
                </button>
              )
            ) : (
              <Link to="/login">
                <Shield size={18} /> Log in for tickets
              </Link>
            )}
            <div className="calendar-actions">
              <a href={googleCalendar} target="_blank" rel="noopener noreferrer">
                <CalendarPlus size={16} /> Google
              </a>
              <a href={outlookCalendar} target="_blank" rel="noopener noreferrer">
                Outlook
              </a>
              <a href={`/api/calendar/${shownEvent.slug}.ics`}>Apple ICS</a>
            </div>
            <small>
              {shownEvent.rsvpCount.toLocaleString()} RSVPs / {shownEvent.ticketSalesCount.toLocaleString()} tickets sold
            </small>
            {ticketAction ? <small>{ticketAction}</small> : null}
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
          <img src={shownEvent.media.coverImage} alt="" />
          <h2>Why this room matters</h2>
          {shownEvent.descriptionHtml ? <div className="rich-description" dangerouslySetInnerHTML={{ __html: shownEvent.descriptionHtml }} /> : <p>{shownEvent.summary}</p>}
          <div className="media-slots">
            {shownEvent.media.gallery && shownEvent.media.gallery.length > 0 ? (
              <ImageSlider images={shownEvent.media.gallery} />
            ) : (
              <div className="no-gallery">Gallery empty</div>
            )}
            <div>Video trailer ready</div>
            <div>Organizer media ready</div>
          </div>
        </div>
        <aside className="event-facts">
          <span>
            <CalendarDays size={17} />
            {new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(new Date(shownEvent.startsAt))}
          </span>
          <span>
            <Users size={17} />
            {shownEvent.attendeeCount.toLocaleString()} attending
          </span>
          <span>
            <LinkIcon size={17} />
            {shownEvent.country}
          </span>
          <span>
            <button
              type="button"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", color: "inherit", font: "inherit", padding: 0 }}
              onClick={() => setIsShareOpen(true)}
            >
              <Share2 size={17} /> Share Event
            </button>
          </span>
        </aside>
      </section>

      {shownEvent.schedule?.length ? <section className="section-wrap event-section"><div className="section-heading"><span>Agenda</span><h2>Plan your experience.</h2></div><div className="agenda-list">{shownEvent.schedule.map((session) => <article key={session.id}><time>{new Date(session.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time><div><span>{session.type} · {session.track}</span><h3>{session.title}</h3><p>{session.description}</p>{session.location ? <small>{session.location}</small> : null}</div></article>)}</div></section> : null}

      {shownEvent.speakers?.length ? <section className="section-wrap event-section"><div className="section-heading"><span>Speakers</span><h2>Meet the people on stage.</h2></div><div className="speaker-grid">{shownEvent.speakers.map((speaker) => <article key={speaker.id}>{speaker.photo ? <img src={speaker.photo} alt={speaker.name} loading="lazy"/> : null}<h3>{speaker.name}</h3><strong>{speaker.role}{speaker.organization ? ` · ${speaker.organization}` : ""}</strong><p>{speaker.biography}</p></article>)}</div></section> : null}

      {shownEvent.tickets?.length ? (
        <section className="section-wrap event-section">
          <div className="section-heading">
            <span>Access</span>
            <h2>Choose your ticket.</h2>
          </div>
          <div className="ticket-grid">
            {shownEvent.tickets.map((ticket) => (
              <article key={ticket.id ?? ticket.name}>
                <h3>{ticket.name}</h3>
                <strong>{ticket.priceMinor ? `${ticket.currency} ${(ticket.priceMinor / 100).toLocaleString()}` : "Free"}</strong>
                <p>{ticket.description}</p>
                <small>{ticket.capacity ? `${Math.max(0, ticket.capacity - (ticket.reservedCount ?? 0))} remaining` : "No fixed limit"}</small>
                <button
                  type="button"
                  className="s3-primary"
                  style={{ marginTop: "12px", width: "100%" }}
                  onClick={async () => {
                    if (!auth.token) {
                      navigate("/login");
                      return;
                    }
                    if (!ticket.priceMinor) {
                      try {
                        const result = await registerForEvent(auth.token, shownEvent.slug, { ticketTypeId: ticket.id });
                        const updated = result.dashboard.history.find((item) => item.slug === shownEvent.slug);
                        if (updated) setLiveEvent(updated);
                        setIsRegistered(true);
                        setTicketAction(`Registered for ${ticket.name}`);
                      } catch (err) {
                        setTicketAction(err instanceof Error ? err.message : "Registration failed");
                      }
                      return;
                    }
                    setSelectedTicketTier(ticket.id);
                    setIsCheckoutOpen(true);
                  }}
                >
                  {ticket.priceMinor ? "Buy Ticket" : isRegistered ? "Registered" : "Register Free"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {shownEvent.faqs?.length ? <section className="section-wrap event-section"><div className="section-heading"><span>FAQ</span><h2>Good to know.</h2></div><div className="faq-list">{shownEvent.faqs.map((faq) => <details key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section> : null}

      {related.length ? (
        <section className="section-wrap">
          <div className="section-heading">
            <span>More like this</span>
            <h2>Keep following the signal.</h2>
          </div>
          <div className="event-grid compact">{related.map((item) => <EventCard event={item} key={item.id} />)}</div>
        </section>
      ) : null}

      {isCheckoutOpen ? (
        <CheckoutModal
          event={shownEvent}
          user={auth.user}
          initialTicketTypeId={selectedTicketTier}
          onClose={() => setIsCheckoutOpen(false)}
        />
      ) : null}
      {isShareOpen ? (
        <SocialShareModal
          event={shownEvent}
          onClose={() => setIsShareOpen(false)}
        />
      ) : null}
    </main>
  );
}

function OrganizerPage() {
  const { slug = "" } = useParams();
  const { data, error, loading } = useAsync(() => getOrganizer(slug), [slug]);
  const navigate = useNavigate();

  useEffect(() => {
    if (data) document.title = `${data.organizer.name} events | Voryn`;
  }, [data]);

  useEffect(() => {
    if (error && (error.includes("404") || error.toLowerCase().includes("not found"))) {
      navigate("/404", { replace: true });
    }
  }, [error, navigate]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "Organizer not found"} />;

  return <OrganizerPageContent data={data} />;
}

function OrganizerPageContent({ data }: { data: { organizer: Organizer; upcoming: Event[]; past: Event[] } }) {
  const { organizer, upcoming, past } = data;
  const [liveOrganizer, setLiveOrganizer] = useState(organizer);
  const shownOrganizer = liveOrganizer.slug === organizer.slug ? liveOrganizer : organizer;

  return (
    <main>
      <BrandNav />
      <section className="organizer-hero">
        <img src={shownOrganizer.coverImage} alt="" />
        <div className="hero-overlay" />
        <div className="organizer-profile">
          <img src={shownOrganizer.profileImage} alt="" width={116} height={116} />
          <div>
            <p className="eyebrow">Organizer profile</p>
            <h1>{shownOrganizer.name}</h1>
            <p>{shownOrganizer.bio}</p>
            <div className="organizer-actions">
              <button
                onClick={async () => {
                  const result = await followOrganizer(shownOrganizer.slug);
                  setLiveOrganizer(result.organizer);
                }}
              >
                <Heart size={18} /> Follow
              </button>
              <button>
                <Bell size={18} /> Updates
              </button>
              <a href={shownOrganizer.website}>
                <ExternalLink size={18} /> Website
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section-wrap organizer-stats">
        <div>
          <strong>{shownOrganizer.followers.toLocaleString()}</strong>
          <span>Followers</span>
        </div>
        <div>
          <strong>{shownOrganizer.totalAttendeesHosted.toLocaleString()}</strong>
          <span>Total attendees hosted</span>
        </div>
        <div>
          <strong>{upcoming.length}</strong>
          <span>Upcoming events</span>
        </div>
        <div>
          <strong>{past.length}</strong>
          <span>Past events</span>
        </div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span>
            <UsersRound size={17} /> Upcoming
          </span>
          <h2>Follow the next rooms from {shownOrganizer.name}.</h2>
        </div>
        <div className="event-grid">
          {upcoming.map((event, index) => (
            <EventCard event={event} large={index === 0} key={event.id} />
          ))}
        </div>
      </section>
    </main>
  );
}

function AuthGate({ allowed, children }: { allowed: Role[]; children: (auth: ReturnType<typeof useAuthSession>) => React.ReactNode }) {
  const auth = useAuthSession();
  if (!auth.initialized) {
    return <LoadingScreen />;
  }
  if (!auth.user || !auth.token) {
    return <AuthPage defaultRole={allowed.includes("organizer") ? "organizer" : "participant"} adminOnly={allowed.length === 1 && allowed[0] === "admin"} />;
  }
  const memberAllowed =
    (allowed.includes("participant") || allowed.includes("organizer")) &&
    (auth.user.role === "participant" || auth.user.role === "organizer");
  if (!allowed.includes(auth.user.role) && !memberAllowed) {
    return (
      <main>
        <BrandNav />
        <section className="portal-hero">
          <p className="eyebrow">Role access</p>
          <h1>This dashboard is for {allowed.join(" or ")} accounts.</h1>
          <button className="solid-dark" onClick={auth.logout}>
            <LogOut size={18} /> Switch account
          </button>
        </section>
      </main>
    );
  }
  return <>{children(auth)}</>;
}

function dashboardPath(user: User) {
  return user.lastDashboard === "organizer" ? "/organizer" : user.lastDashboard === "admin" ? "/admin" : "/dashboard";
}

function AuthPage({
  defaultRole = "participant",
  adminOnly = false
}: {
  defaultRole?: Exclude<Role, "guest">;
  adminOnly?: boolean;
}) {
  const auth = useAuthSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<Exclude<Role, "guest">>(adminOnly ? "admin" : defaultRole === "admin" ? "participant" : defaultRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (auth.initialized && auth.user) {
      navigate(dashboardPath(auth.user), { replace: true });
    }
  }, [auth.initialized, auth.user, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);
    try {
      const result =
        mode === "login"
          ? adminOnly
            ? await adminLogin({ email, password })
            : await login({ email, password })
          : await signup({ name: name || email.split("@")[0], email, password, role });
      auth.setAuth("cookie-session", result.user);
      navigate(dashboardPath(result.user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const destination = auth.user ? dashboardPath(auth.user) : "/attendee";

  return (
    <main>
      <BrandNav />
      <section className="portal-hero auth-hero">
        <div>
          <p className="eyebrow">{adminOnly ? "Admin access" : "Authentication"}</p>
          <h1>{adminOnly ? "Admin sign in lives here." : "Sign in to the right side of Voryn."}</h1>
          <p>{adminOnly ? "Admin registration and login are separated from normal user signup." : "Guests can browse and search. Attendees register and manage tickets. Organizers manage events."}</p>
          {auth.user ? (
            <Link className="hero-link" to={destination}>
              Continue to dashboard <ArrowRight size={18} />
            </Link>
          ) : null}
        </div>
        <form className="portal-card auth-card" onSubmit={submit} aria-busy={isSubmitting}>
          <div className="mode-switch">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} disabled={isSubmitting}>
              Log in
            </button>
            {!adminOnly ? <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} disabled={isSubmitting}>Sign up</button> : null}
          </div>
          {mode === "signup" ? <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" autoComplete="name" minLength={2} maxLength={100} disabled={isSubmitting} required /> : null}
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" autoComplete="email" maxLength={254} disabled={isSubmitting} required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : undefined} maxLength={128} disabled={isSubmitting} required />
          {mode === "signup" ? <small className="form-hint">Use 12–128 characters with uppercase, lowercase, and a number.</small> : null}
          {mode === "signup" && !adminOnly ? (
            <select value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "guest">)} disabled={isSubmitting}>
              <option value="participant">Attendee</option>
              <option value="organizer">Organizer</option>
            </select>
          ) : null}
          {error ? <small className="form-error">{error}</small> : null}
          <button className="solid-dark" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="button-spinner" size={18} aria-hidden="true" /> : <Shield size={18} />}
            {isSubmitting ? (mode === "login" ? "Logging in…" : "Creating account…") : (mode === "login" ? "Log in" : "Create account")}
          </button>
          {mode === "login" && !adminOnly ? <Link to="/forgot-password">Forgot password?</Link> : null}
          <small>{adminOnly ? "Administrator accounts are provisioned securely by an operator." : "Use your Voryn account credentials."}</small>
        </form>
      </section>
    </main>
  );
}

function PasswordResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (token) {
        await confirmPasswordReset(token, password);
        setMessage("Password updated. You can now sign in.");
      } else {
        const result = await requestPasswordReset(email);
        setMessage(result.message);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { setBusy(false); }
  };
  return <main><BrandNav /><section className="portal-hero auth-hero"><div><p className="eyebrow">Account recovery</p><h1>{token ? "Choose a new password." : "Reset your password."}</h1></div><form className="portal-card auth-card" onSubmit={submit}>{token ? <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New strong password" /> : <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />}{message ? <small>{message}</small> : null}<button className="solid-dark" disabled={busy} type="submit">{busy ? "Working…" : token ? "Reset password" : "Send reset instructions"}</button></form></section></main>;
}

function ChangePasswordPage() {
  const auth = useAuthSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  if (!auth.initialized) return <LoadingScreen />;
  if (!auth.user) return <main><BrandNav /><ErrorState message="Sign in before changing your password." /></main>;
  return <main><BrandNav /><section className="portal-hero auth-hero"><div><p className="eyebrow">Account security</p><h1>Change your password.</h1></div><form className="portal-card auth-card" onSubmit={async (event) => { event.preventDefault(); setMessage(""); try { await changePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); setMessage("Password changed and other sessions revoked."); } catch (error) { setMessage(error instanceof Error ? error.message : "Password change failed"); } }}><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New strong password" />{message ? <small>{message}</small> : null}<button className="solid-dark" type="submit">Change password</button></form></section></main>;
}

function DashboardNav({
  title,
  role,
  token,
  setAuth,
  logout,
  user
}: {
  title: string;
  role: string;
  token: string;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  user: User;
}) {
  const navigate = useNavigate();
  return (
    <header className="dashboard-topbar">
      <Link to="/" className="brand-mark">
        <span>V</span>
        Voryn
      </Link>
      <strong>{title}</strong>
      <div className="dashboard-role">
        {user.profileImage ? (
          <img src={user.profileImage} alt="" className="user-avatar" />
        ) : (
          <div className="user-avatar-fallback">{user.name.charAt(0).toUpperCase()}</div>
        )}
        <span>{role === "participant" ? "attendee" : role}</span>
        <Link to="/change-password">Security</Link>
        <button onClick={logout}>
          <LogOut size={17} /> Log out
        </button>
      </div>
    </header>
  );
}

function FloatingDashboardSwitch({
  active,
  token,
  setAuth
}: {
  active: "participant" | "organizer";
  token: string;
  setAuth: (token: string, user: User) => void;
}) {
  const navigate = useNavigate();
  const switchTo = async (dashboard: "participant" | "organizer") => {
    const result = await switchDashboard(token, dashboard);
    setAuth(token, result.user);
    navigate(dashboardPath(result.user));
  };

  return (
    <div className="floating-dashboard-switch" aria-label="Switch dashboard">
      <button className={active === "participant" ? "active" : ""} onClick={() => switchTo("participant")}>
        <Users size={18} />
        <span>
          <strong>Attendee</strong>
          <small>Tickets and saves</small>
        </span>
      </button>
      <button className={active === "organizer" ? "active" : ""} onClick={() => switchTo("organizer")}>
        <Compass size={18} />
        <span>
          <strong>Organizer</strong>
          <small>Create events</small>
        </span>
      </button>
    </div>
  );
}

function MetricPanel({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="portal-metric">
      <Icon size={20} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function OrganizerDashboardPage() {
  return (
    <AuthGate allowed={["organizer", "admin"]}>
      {(auth) => <OrganizerDashboardContent token={auth.token} user={auth.user!} setAuth={auth.setAuth} logout={auth.logout} />}
    </AuthGate>
  );
}

function OrganizerDashboardContent({ token, user, setAuth, logout }: { token: string; user: User; setAuth: (token: string, user: User) => void; logout: () => void }) {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => searchParams.get("tab") || "Create Event");
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatusFilter, setEventStatusFilter] = useState("all");
  const [eventCategoryFilter, setEventCategoryFilter] = useState("all");
  const [eventDateFilter, setEventDateFilter] = useState("all");
  const [eventSort, setEventSort] = useState("updated");
  const [eventPage, setEventPage] = useState(1);
  const [eventView, setEventView] = useState<"list" | "cards">("list");
  const [draft, setDraft] = useState({
    title: "New Voryn Event",
    citySlug: "lagos",
    category: "Technology" as Interest,
    status: "draft" as EventStatus,
    startsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    venue: "TBA",
    priceLabel: "Free",
    summary: "A new event for the Voryn community.",
    coverImage: "",
    heroImage: "",
    thumbnail: "",
    gallery: [] as string[]
  });
  const [profile, setProfile] = useState({ name: user.name, organizerName: "", bio: "", website: "", profileImage: user.profileImage || "" });
  const { data, error, loading } = useAsync<OrganizerDashboard>(() => getOrganizerDashboard(token), [token, refreshKey]);
  const tabs = ["Overview", "My Events", "Create Event", "Analytics", "Attendees", "Revenue", "Profile", "Settings"];

  useEffect(() => {
    if (data) {
      setProfile({
        name: data.user.name,
        organizerName: data.organizer.name,
        bio: data.organizer.bio,
        website: data.organizer.website,
        profileImage: data.user.profileImage || ""
      });
    }
  }, [data?.organizer.slug, data?.user.profileImage]);

  useEffect(() => {
    if (error?.includes("401")) {
      logout();
    }
  }, [error, logout]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "Dashboard unavailable"} />;
  const filteredEvents = data.events.filter((event) => (eventStatusFilter === "all" || event.status === eventStatusFilter) && (eventCategoryFilter === "all" || event.category === eventCategoryFilter) && (eventDateFilter === "all" || (eventDateFilter === "upcoming" ? new Date(event.startsAt) >= new Date() : new Date(event.startsAt) < new Date())) && `${event.title} ${event.category}`.toLowerCase().includes(eventSearch.toLowerCase())).sort((a, b) => eventSort === "date" ? new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() : eventSort === "title" ? a.title.localeCompare(b.title) : new Date(b.updatedAt ?? b.startsAt).getTime() - new Date(a.updatedAt ?? a.startsAt).getTime());
  const pageSize = 8; const eventPageCount = Math.max(1, Math.ceil(filteredEvents.length / pageSize)); const pagedEvents = filteredEvents.slice((Math.min(eventPage, eventPageCount) - 1) * pageSize, Math.min(eventPage, eventPageCount) * pageSize);

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingSlug) await updateOrganizerEvent(token, editingSlug, draft);
    else await createOrganizerEvent(token, draft);
    setEditingSlug(null); setRefreshKey((value) => value + 1); setTab("My Events");
  };

  const announce = async () => {
    const first = data.events[0];
    if (!first) return;
    await sendAnnouncement(token, {
      eventSlug: first.slug,
      subject: "Event update",
      message: "A new update has been sent to registered attendees."
    });
    setRefreshKey((value) => value + 1);
  };

  const exportCsv = async () => {
    const csv = await exportAttendees(token);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "voryn-attendees.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="dashboard-shell">
      <DashboardNav title="Organizer Portal" role={user.role} token={token} setAuth={setAuth} logout={logout} user={data.user} />
      {user.role !== "admin" ? <FloatingDashboardSwitch active="organizer" token={token} setAuth={setAuth} /> : null}
      <aside className="dashboard-sidebar">
        {tabs.map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => { if (item === "Create Event") { setEditingEvent(undefined); setEditingSlug(null); } setTab(item); }}>
            {item}
          </button>
        ))}
      </aside>
      <section className="dashboard-main">
        <div className="dashboard-heading">
          <span>{data.organizer.name}</span>
          <h1>{tab}</h1>
        </div>

        {tab === "Overview" ? (
          <div className="portal-grid four">
            <MetricPanel icon={CalendarDays} label="Events" value={data.overview.events} />
            <MetricPanel icon={Users} label="Attendees" value={data.overview.attendees.toLocaleString()} />
            <MetricPanel icon={Ticket} label="Registrations" value={data.overview.registrations} />
            <MetricPanel icon={DollarSign} label="Revenue" value={money(data.overview.revenue)} />
          </div>
        ) : null}

        {tab === "My Events" ? (
          <div className="portal-card">
            <div className="table-actions">
              <input aria-label="Search events" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Search events" />
              <select aria-label="Filter by status" value={eventStatusFilter} onChange={(event) => setEventStatusFilter(event.target.value)}><option value="all">All statuses</option>{["draft","scheduled","published","cancelled","completed","archived","trashed"].map((status) => <option key={status}>{status}</option>)}</select>
              <select aria-label="Filter by category" value={eventCategoryFilter} onChange={(event) => setEventCategoryFilter(event.target.value)}><option value="all">All categories</option>{[...new Set(data.events.map((item) => item.category))].map((category) => <option key={category}>{category}</option>)}</select>
              <select aria-label="Filter by date" value={eventDateFilter} onChange={(event) => setEventDateFilter(event.target.value)}><option value="all">Any date</option><option value="upcoming">Upcoming</option><option value="past">Past</option></select>
              <select aria-label="Sort events" value={eventSort} onChange={(event) => setEventSort(event.target.value)}><option value="updated">Recently updated</option><option value="date">Event date</option><option value="title">Title</option></select>
              <button onClick={() => setEventView((view) => view === "list" ? "cards" : "list")}>{eventView === "list" ? "Card view" : "List view"}</button>
              <button onClick={announce}>
                <Mail size={17} /> Send announcement
              </button>
              <button onClick={exportCsv}>
                <Download size={17} /> Export attendees
              </button>
            </div>
            <div className={`portal-table event-manager-${eventView}`}>
              {pagedEvents.map((event) => (
                <div className="portal-row" key={event.id}>
                  <img className="event-row-cover" src={event.media.coverImage || event.media.thumbnail} alt="" loading="lazy" />
                  <strong>{event.title}</strong>
                  <span>{event.category}</span>
                  <span>{event.status}</span>
                  <span>{event.attendeeCount.toLocaleString()} attendees</span>
                  <Link to={`/events/${event.slug}`} aria-label={`View ${event.title}`}><ExternalLink size={16} /></Link>
                  <button aria-label={`Duplicate ${event.title}`} onClick={async () => { await duplicateOrganizerEvent(token, event.slug); setRefreshKey((value) => value + 1); }}><Plus size={16} /></button>
                  {event.status === "draft" ? <button aria-label={`Publish ${event.title}`} onClick={async () => { await transitionOrganizerEvent(token, event.slug, { action: "publish", version: event.version }); setRefreshKey((value) => value + 1); }}><CheckCircle2 size={16} /></button> : null}
                  {event.status === "published" ? <button aria-label={`Unpublish ${event.title}`} onClick={async () => { if (!window.confirm("Unpublish this event?")) return; await transitionOrganizerEvent(token, event.slug, { action: "unpublish", version: event.version }); setRefreshKey((value) => value + 1); }}><XCircle size={16} /></button> : null}
                  {event.status === "trashed" ? <button aria-label={`Restore ${event.title}`} onClick={async () => { await transitionOrganizerEvent(token, event.slug, { action: "restore", version: event.version }); setRefreshKey((value) => value + 1); }}><ArrowRight size={16} /></button> : null}
                  <select aria-label={`Lifecycle actions for ${event.title}`} defaultValue="" onChange={async (choice) => { const action = choice.target.value as "publish" | "unpublish" | "cancel" | "complete" | "archive"; choice.target.value = ""; if (!action) return; if (!window.confirm(`${action[0].toUpperCase() + action.slice(1)} “${event.title}”?`)) return; const reason = action === "cancel" ? window.prompt("Optional cancellation reason") ?? undefined : undefined; await transitionOrganizerEvent(token, event.slug, { action, version: event.version, reason }); setRefreshKey((value) => value + 1); }}><option value="">More…</option>{event.status === "scheduled" ? <><option value="publish">Publish now</option><option value="unpublish">Return to draft</option></> : null}{event.status === "published" ? <><option value="cancel">Cancel event</option><option value="complete">Mark completed</option></> : null}{event.status === "cancelled" || event.status === "completed" ? <option value="archive">Archive</option> : null}</select>
                  {event.status !== "trashed" ? <button
                    onClick={async () => {
                      setDraft({
                        title: event.title, citySlug: event.citySlug, category: event.category, status: event.status,
                        startsAt: event.startsAt, venue: event.venue, priceLabel: event.priceLabel, summary: event.summary,
                        coverImage: event.media.coverImage, heroImage: event.media.heroImage, thumbnail: event.media.thumbnail,
                        gallery: event.media.gallery ?? []
                      });
                      setEditingSlug(event.slug);
                      setEditingEvent(event);
                      setTab("Create Event");
                    }}
                  >
                    <Edit3 size={16} />
                  </button> : null}
                  {["draft", "scheduled", "archived"].includes(event.status) ? <button
                    onClick={async () => {
                      if (!window.confirm(`Move “${event.title}” to trash?`)) return;
                      await transitionOrganizerEvent(token, event.slug, { action: "trash", version: event.version });
                      setRefreshKey((value) => value + 1);
                    }}
                  >
                    <Trash2 size={16} />
                  </button> : null}
                </div>
              ))}
              {!pagedEvents.length ? <div className="empty-state"><CalendarDays size={28}/><strong>No events match these filters.</strong></div> : null}
            </div>
            <div className="pagination"><button disabled={eventPage <= 1} onClick={() => setEventPage((page) => Math.max(1, page - 1))}>Previous</button><span>Page {Math.min(eventPage, eventPageCount)} of {eventPageCount}</span><button disabled={eventPage >= eventPageCount} onClick={() => setEventPage((page) => Math.min(eventPageCount, page + 1))}>Next</button></div>
          </div>
        ) : null}

        {tab === "Create Event" ? (
          <EventBuilder
            token={token}
            initial={editingEvent}
            onSaved={(event) => { setEditingEvent(event); setEditingSlug(event.slug); setRefreshKey((value) => value + 1); }}
            onExit={() => { setEditingEvent(undefined); setEditingSlug(null); setTab("My Events"); setRefreshKey((value) => value + 1); }}
          />
        ) : null}

        {tab === "Legacy Create Event" ? (
          <form className="portal-card form-grid" onSubmit={saveEvent}>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Title" />
            <select value={draft.citySlug} onChange={(event) => setDraft({ ...draft, citySlug: event.target.value })}>
              <option value="lagos">Lagos</option>
              <option value="abuja">Abuja</option>
              <option value="washington-dc">Washington D.C.</option>
              <option value="london">London</option>
              <option value="ottawa">Ottawa</option>
            </select>
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Interest })}>
              {["Technology", "Business", "Startups", "Music", "Entertainment", "Sports", "Networking", "Education", "Career", "Finance", "Fashion", "Health", "Gaming", "Arts", "Religion", "Community Events"].map((interest) => (
                <option key={interest}>{interest}</option>
              ))}
            </select>
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as EventStatus })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="sold-out">Sold out</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} />
            <input value={draft.venue} onChange={(event) => setDraft({ ...draft, venue: event.target.value })} placeholder="Venue" />
            <input value={draft.priceLabel} onChange={(event) => setDraft({ ...draft, priceLabel: event.target.value })} placeholder="Price" />
            
            <div className="image-input-group">
              <label>Hero Image</label>
              <input value={draft.heroImage} onChange={(event) => setDraft({ ...draft, heroImage: event.target.value })} placeholder="Hero Image URL" />
              <input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setDraft({ ...draft, heroImage: base64 });
                }
              }} />
            </div>

            <div className="image-input-group">
              <label>Cover Image</label>
              <input value={draft.coverImage} onChange={(event) => setDraft({ ...draft, coverImage: event.target.value })} placeholder="Cover Image URL" />
              <input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setDraft({ ...draft, coverImage: base64 });
                }
              }} />
            </div>

            <div className="image-input-group">
              <label>Thumbnail Image</label>
              <input value={draft.thumbnail} onChange={(event) => setDraft({ ...draft, thumbnail: event.target.value })} placeholder="Thumbnail Image URL" />
              <input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setDraft({ ...draft, thumbnail: base64 });
                }
              }} />
            </div>

            <div className="image-slider-manager">
              <label>Event Description Image Slider (Gallery)</label>
              <div className="slider-manager-list">
                {draft.gallery.map((img, idx) => (
                  <div key={idx} className="slider-manager-item">
                    <img src={img} alt="" />
                    <button type="button" onClick={() => setDraft({ ...draft, gallery: draft.gallery.filter((_, i) => i !== idx) })}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="slider-manager-adder">
                <input id="slider-url-input" placeholder="Paste image URL here" onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const input = e.currentTarget;
                    if (input.value) {
                      setDraft({ ...draft, gallery: [...draft.gallery, input.value] });
                      input.value = "";
                    }
                  }
                }} />
                <input type="file" accept="image/*" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    const base64 = await toBase64(file);
                    setDraft({ ...draft, gallery: [...draft.gallery, base64] });
                  }
                }} />
              </div>
            </div>

            <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            <button className="solid-dark" type="submit">
              {editingSlug ? <Edit3 size={18} /> : <Plus size={18} />} {editingSlug ? "Save event changes" : "Create event"}
            </button>
          </form>
        ) : null}

        {tab === "Analytics" ? (
          <div className="analytics-dashboard">
            <div className="analytics-summary-grid">
              <div className="analytics-summary-card">
                <h3>Overall Conversion</h3>
                <div className="metric-value">
                  Not configured
                </div>
                <p>Average registration success</p>
              </div>
              <div className="analytics-summary-card">
                <h3>Total RSVPs</h3>
                <div className="metric-value">
                  {data.analytics.reduce((sum, item) => sum + item.rsvpCount, 0).toLocaleString()}
                </div>
                <p>Accumulated event interest</p>
              </div>
              <div className="analytics-summary-card">
                <h3>Ticket Revenue</h3>
                <div className="metric-value">
                  {money(null)}
                </div>
                <p>Direct ticket sales</p>
              </div>
            </div>
            
            <h2 className="section-title">Event Performance Analytics</h2>
            <div className="analytics-list">
              {data.analytics.map((item) => (
                <div className="analytics-card" key={item.eventSlug}>
                  <div className="analytics-card-header">
                    <h4>{item.title}</h4>
                    <span className="analytics-revenue">{money(item.revenue)}</span>
                  </div>
                  
                  <div className="analytics-stats-row">
                    <div className="stat-item">
                      <span className="stat-label">RSVPs</span>
                      <span className="stat-value">{item.rsvpCount.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Tickets Sold</span>
                      <span className="stat-value">{item.ticketSalesCount.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Attendee Count</span>
                      <span className="stat-value">{item.attendeeCount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="analytics-conversion">
                    <div className="conversion-header">
                      <span>Conversion Rate</span>
                      <strong>{item.conversionRate === null ? "N/A" : `${Math.round(item.conversionRate * 100)}%`}</strong>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${item.conversionRate === null ? 0 : Math.round(item.conversionRate * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "Attendees" ? (
          <div className="portal-card portal-table">
            {data.attendees.length ? data.attendees.map((attendee) => (
              <div className="portal-row" key={attendee.id}>
                <strong>{attendee.user.name}</strong>
                <span>{attendee.user.email}</span>
                <span>{attendee.eventSlug}</span>
                <span>{attendee.ticketCode}</span>
                <span>{attendee.approvalStatus}</span>
                {attendee.approvalStatus === "pending" ? <><button onClick={async () => { await decideRegistration(token, attendee.id, "approved"); setRefreshKey((value) => value + 1); }}>Approve</button><button onClick={async () => { if (!window.confirm("Reject this registration and release its capacity?")) return; await decideRegistration(token, attendee.id, "rejected"); setRefreshKey((value) => value + 1); }}>Reject</button></> : null}
              </div>
            )) : <span>No registrations yet.</span>}
          </div>
        ) : null}

        {tab === "Revenue" ? (
          <div className="portal-grid">
            <MetricPanel icon={DollarSign} label="Total revenue" value={money(data.revenue.total)} />
            {data.revenue.byEvent.map((item) => (
              <div className="portal-card" key={item.eventSlug}>
                <strong>{item.title}</strong>
                <span>{money(item.revenue)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "Profile" ? (
          <form
            className="portal-card form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await updateOrganizerProfile(token, profile);
              setAuth(token, result.user);
              setRefreshKey((value) => value + 1);
            }}
          >
            <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Account name" />
            <input value={profile.organizerName} onChange={(event) => setProfile({ ...profile, organizerName: event.target.value })} placeholder="Organizer name" />
            <input value={profile.website} onChange={(event) => setProfile({ ...profile, website: event.target.value })} placeholder="Website" />
            
            <div className="image-input-group">
              <label>Profile Picture</label>
              <input value={profile.profileImage} onChange={(event) => setProfile({ ...profile, profileImage: event.target.value })} placeholder="Profile Image URL" />
              <input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setProfile({ ...profile, profileImage: base64 });
                }
              }} />
            </div>

            <textarea value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} />
            <button className="solid-dark" type="submit">
              <Settings size={18} /> Save profile
            </button>
          </form>
        ) : null}

        {tab === "Settings" ? (
          <div className="portal-card settings-list">
            <label>
              <input type="checkbox" checked readOnly />
              Email announcements enabled
            </label>
            <label>
              <input type="checkbox" checked readOnly />
              Push announcement channel enabled
            </label>
            <label>
              <input type="checkbox" checked readOnly />
              SMS-ready reminder architecture enabled
            </label>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ParticipantDashboardPage() {
  return (
    <AuthGate allowed={["participant", "admin"]}>
      {(auth) => <ParticipantDashboardContent token={auth.token} user={auth.user!} setAuth={auth.setAuth} logout={auth.logout} />}
    </AuthGate>
  );
}

function ParticipantDashboardContent({ token, user, setAuth, logout }: { token: string; user: User; setAuth: (token: string, user: User) => void; logout: () => void }) {
  const [tab, setTab] = useState("Overview");
  const [ticketText, setTicketText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState({ name: user.name, email: user.email, profileImage: user.profileImage || "" });
  const { data, error, loading } = useAsync<ParticipantDashboard>(() => getParticipantDashboard(token), [token, refreshKey]);
  const tabs = ["Overview", "Favorites", "Upcoming", "Past", "History", "Tickets", "Notifications", "Reviews", "Profile"];

  useEffect(() => {
    if (data) setProfile({ name: data.user.name, email: data.user.email, profileImage: data.user.profileImage || "" });
  }, [data?.user.id, data?.user.profileImage]);

  useEffect(() => {
    if (error?.includes("401")) {
      logout();
    }
  }, [error, logout]);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "Dashboard unavailable"} />;

  const firstEvent = data.upcoming[0] ?? data.history[0];

  return (
    <main className="dashboard-shell">
      <DashboardNav title="Attendee Portal" role={user.role} token={token} setAuth={setAuth} logout={logout} user={data.user} />
      {user.role !== "admin" ? <FloatingDashboardSwitch active="participant" token={token} setAuth={setAuth} /> : null}
      <aside className="dashboard-sidebar">
        {tabs.map((item) => (
          <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </aside>
      <section className="dashboard-main">
        <div className="dashboard-heading">
          <span>{data.user.name}</span>
          <h1>{tab}</h1>
        </div>
        {tab === "Overview" ? (
          <div className="portal-grid four">
            <MetricPanel icon={Heart} label="Favorites" value={data.favorites.length} />
            <MetricPanel icon={Ticket} label="Registrations" value={data.registrations.length} />
            <MetricPanel icon={CalendarClock} label="Upcoming" value={data.upcoming.length} />
            <MetricPanel icon={Bell} label="Reminders" value={data.reminders.length} />
          </div>
        ) : null}
        {tab === "Favorites" ? (
          <div className="event-grid compact">
            {data.favorites.map((event) => (
              <div className="portal-card" key={event.id}>
                <EventCard event={event} />
                <button
                  onClick={async () => {
                    await removeFavoriteEvent(token, event.slug);
                    setRefreshKey((value) => value + 1);
                  }}
                >
                  <Trash2 size={17} /> Remove favorite
                </button>
              </div>
            ))}
            {!data.favorites.length ? <div className="portal-card">No saved events yet.</div> : null}
          </div>
        ) : null}
        {tab === "Upcoming" ? (
          <div className="portal-card portal-table">
            {data.upcoming.map((event) => (
              <div className="portal-row" key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{new Date(event.startsAt).toLocaleString()}</span>
                  <a href={data.calendar[event.slug]?.google} target="_blank" rel="noopener noreferrer">Google</a>
                  <a href={data.calendar[event.slug]?.outlook} target="_blank" rel="noopener noreferrer">Outlook</a>
                  <a href={data.calendar[event.slug]?.apple}>Apple ICS</a>
                  <button
                    onClick={async () => {
                      setTicketText(await downloadTicket(token, event.slug));
                      setTab("Tickets");
                    }}
                  >
                    <Download size={16} />
                  </button>
                </div>
              ))}
              {!data.upcoming.length ? <span>No upcoming registrations yet.</span> : null}
          </div>
        ) : null}
        {tab === "Past" || tab === "History" ? (
          <div className="event-grid compact">
            {(tab === "Past" ? data.past : data.history).map((event) => <EventCard event={event} key={event.id} />)}
          </div>
        ) : null}
        {tab === "Tickets" ? (
          <div className="portal-card">
            <button
              disabled={!firstEvent}
              onClick={async () => {
                if (firstEvent) setTicketText(await downloadTicket(token, firstEvent.slug));
              }}
            >
              <Download size={17} /> Download latest ticket
            </button>
            <pre>{ticketText || "Register for an event to generate a downloadable ticket."}</pre>
          </div>
        ) : null}
        {tab === "Notifications" ? (
          <div className="portal-card settings-list">
            {(["email", "push", "smsReady"] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={data.user.notifications[key]}
                  onChange={async (event) => {
                    await updateNotifications(token, { ...data.user.notifications, [key]: event.target.checked });
                    setRefreshKey((value) => value + 1);
                  }}
                />
                {key === "smsReady" ? "SMS-ready architecture" : key}
              </label>
            ))}
            <div className="portal-table">
              {data.reminders.slice(0, 8).map((reminder, index) => (
                <div className="portal-row" key={`${reminder.channel}-${reminder.scheduledAt}-${index}`}>
                  <strong>{reminder.offset}</strong>
                  <span>{reminder.channel}</span>
                  <span>{new Date(reminder.scheduledAt).toLocaleString()}</span>
                  <span>{reminder.status}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "Reviews" ? (
          <div className="portal-card">
            <button
              disabled={!firstEvent}
              onClick={async () => {
                if (firstEvent) {
                  await leaveReview(token, firstEvent.slug, { rating: 5, comment: "Great event experience." });
                  setRefreshKey((value) => value + 1);
                }
              }}
            >
              <Sparkles size={17} /> Leave review
            </button>
            <div className="portal-table">
              {data.reviews.map((review) => (
                <div className="portal-row" key={review.id}>
                  <strong>{review.eventSlug}</strong>
                  <span>{review.rating}/5</span>
                  <span>{review.comment}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "Profile" ? (
          <form
            className="portal-card form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await updateParticipantProfile(token, profile);
              setAuth(token, result.user);
              setRefreshKey((value) => value + 1);
            }}
          >
            <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Name" />
            <input value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} placeholder="Email" />
            
            <div className="image-input-group">
              <label>Profile Picture</label>
              <input value={profile.profileImage} onChange={(event) => setProfile({ ...profile, profileImage: event.target.value })} placeholder="Profile Image URL" />
              <input type="file" accept="image/*" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  const base64 = await toBase64(file);
                  setProfile({ ...profile, profileImage: base64 });
                }
              }} />
            </div>

            <button className="solid-dark" type="submit">
              <Settings size={18} /> Save profile
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function AdminDashboardPage() {
  return (
    <AuthGate allowed={["admin"]}>
      {(auth) => <AdminDashboardContent token={auth.token} user={auth.user!} setAuth={auth.setAuth} logout={auth.logout} />}
    </AuthGate>
  );
}

function AdminDashboardContent({ token, user, setAuth, logout }: { token: string; user: User; setAuth: (token: string, user: User) => void; logout: () => void }) {
  const { data, error, loading } = useAsync<AdminDashboard>(() => getAdminDashboard(token), [token]);

  useEffect(() => {
    if (error?.includes("401")) {
      logout();
    }
  }, [error, logout]);
  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorState message={error ?? "Admin unavailable"} />;
  return (
    <main className="dashboard-shell">
      <DashboardNav title="Admin Portal" role={user.role} token={token} setAuth={setAuth} logout={logout} user={user} />
      <section className="dashboard-main admin-main">
        <div className="dashboard-heading">
          <span>Platform management</span>
          <h1>Admin</h1>
        </div>
        <div className="portal-grid four">
          <MetricPanel icon={Users} label="Users" value={data.analytics.users} />
          <MetricPanel icon={UsersRound} label="Organizers" value={data.analytics.organizers} />
          <MetricPanel icon={CalendarDays} label="Events" value={data.analytics.events} />
          <MetricPanel icon={BarChart3} label="Revenue" value={money(data.analytics.revenue)} />
        </div>
        <div className="portal-card portal-table">
          <h2>Moderation queue</h2>
          {data.reports.length ? data.reports.map((report) => (
            <div className="portal-row" key={report.id}>
              <strong>{report.eventSlug}</strong>
              <span>{report.rating}/5</span>
              <span>{report.comment}</span>
            </div>
          )) : <span>No reports need review.</span>}
        </div>
        <div className="portal-card portal-table">
          <h2>Users and organizers</h2>
          {data.users.map((item) => (
            <div className="portal-row" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.email}</span>
              <span>{item.role}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="not-found-container">
      <BrandNav />
      <section className="not-found-content">
        <div className="not-found-card">
          <div className="glass-glow" />
          <span className="not-found-eyebrow">404 Error</span>
          <h1>Page Not Found</h1>
          <p>The page you are looking for does not exist, has been removed, or is a private draft.</p>
          <Link to="/" className="solid-dark-button">
            Go back home
          </Link>
        </div>
      </section>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      <Route path="/forgot-password" element={<PasswordResetPage />} />
      <Route path="/reset-password" element={<PasswordResetPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/attendee" element={<Navigate to="/dashboard" replace />} />
      <Route path="/participant" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard/*" element={<Stage3Dashboard />} />
      <Route path="/organizer/manage" element={<OrganizerDashboardPage />} />
      <Route path="/organizer/*" element={<Stage3Dashboard />} />
      <Route path="/admin/*" element={<Stage3Dashboard />} />
      <Route path="/checkout/callback" element={<CheckoutCallbackPage />} />
      <Route path="/events/:slug" element={<EventPage />} />
      <Route path="/organizers/:slug" element={<OrganizerPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/:city" element={<CityPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
