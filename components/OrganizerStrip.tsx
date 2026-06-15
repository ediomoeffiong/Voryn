import Image from "next/image";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { Organizer } from "@/lib/domain";

export function OrganizerStrip({ organizers }: { organizers: Organizer[] }) {
  return (
    <div className="organizer-grid">
      {organizers.map((organizer) => (
        <Link href={`/organizers/${organizer.slug}`} className="organizer-card" key={organizer.id}>
          <Image src={organizer.coverImage} alt="" fill sizes="33vw" />
          <div className="organizer-card-content">
            <Image src={organizer.profileImage} alt="" width={64} height={64} />
            <span>
              <strong>{organizer.name}</strong>
              <small><UsersRound size={14} />{organizer.followers.toLocaleString()} followers</small>
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
