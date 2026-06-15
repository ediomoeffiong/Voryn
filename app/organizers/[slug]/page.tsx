import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandNav } from "@/components/BrandNav";
import { EventCard } from "@/components/EventCard";
import { getOrganizer, organizers, publicEvents } from "@/lib/data";
import { Bell, ExternalLink, Heart, UsersRound } from "lucide-react";
import Image from "next/image";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return organizers.map((organizer) => ({ slug: organizer.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const organizer = getOrganizer(slug);
  if (!organizer) return {};

  return {
    title: `${organizer.name} events | Voryn`,
    description: organizer.bio
  };
}

export default async function OrganizerPage({ params }: Props) {
  const { slug } = await params;
  const organizer = getOrganizer(slug);
  if (!organizer) notFound();

  const hosted = publicEvents.filter((event) => event.organizerSlug === organizer.slug);
  const upcoming = hosted.filter((event) => event.status !== "completed");
  const past = hosted.filter((event) => event.status === "completed");

  return (
    <main>
      <BrandNav />
      <section className="organizer-hero">
        <Image src={organizer.coverImage} alt="" fill priority sizes="100vw" />
        <div className="hero-overlay" />
        <div className="organizer-profile">
          <Image src={organizer.profileImage} alt="" width={116} height={116} />
          <div>
            <p className="eyebrow">Organizer profile</p>
            <h1>{organizer.name}</h1>
            <p>{organizer.bio}</p>
            <div className="organizer-actions">
              <button><Heart size={18} /> Follow</button>
              <button><Bell size={18} /> Updates</button>
              <a href={organizer.website}><ExternalLink size={18} /> Website</a>
            </div>
          </div>
        </div>
      </section>

      <section className="section-wrap organizer-stats">
        <div><strong>{organizer.followers.toLocaleString()}</strong><span>Followers</span></div>
        <div><strong>{organizer.totalAttendeesHosted.toLocaleString()}</strong><span>Total attendees hosted</span></div>
        <div><strong>{upcoming.length}</strong><span>Upcoming events</span></div>
        <div><strong>{past.length}</strong><span>Past events</span></div>
      </section>

      <section className="section-wrap">
        <div className="section-heading">
          <span><UsersRound size={17} /> Upcoming</span>
          <h2>Follow the next rooms from {organizer.name}.</h2>
        </div>
        <div className="event-grid">
          {upcoming.map((event, index) => <EventCard event={event} large={index === 0} key={event.id} />)}
        </div>
      </section>
    </main>
  );
}
