import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Voryn | Discover events with momentum",
  description:
    "A visual discovery platform for local, online, and global events with creator-led organizers and city-first discovery.",
  metadataBase: new URL("https://voryn.com")
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
