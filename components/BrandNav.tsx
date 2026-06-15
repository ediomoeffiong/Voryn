import Link from "next/link";
import { Compass, Search } from "lucide-react";

export function BrandNav() {
  return (
    <header className="nav-shell">
      <Link href="/" className="brand-mark" aria-label="Voryn home">
        <span>V</span>
        Voryn
      </Link>
      <nav className="nav-links" aria-label="Primary navigation">
        <Link href="/lagos">Lagos</Link>
        <Link href="/london">London</Link>
        <Link href="/tokyo">Tokyo</Link>
      </nav>
      <div className="nav-actions">
        <Link href="/search" className="icon-button" aria-label="Open search">
          <Search size={18} />
        </Link>
        <button className="solid-button">
          <Compass size={18} />
          Host
        </button>
      </div>
    </header>
  );
}
