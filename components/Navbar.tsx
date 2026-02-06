"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import NavMiniPlayer from "./NavMiniPlayer";

export default function Navbar({ userName }: { userName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;

      if (currentY < 10) {
        setVisible(true);
      } else if (currentY < lastScrollY.current) {
        setVisible(true);
      } else if (currentY > lastScrollY.current) {
        setVisible(false);
      }

      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const publicLinks = [
    { href: "/about", label: "About" },
    { href: "/curators", label: "Curators" },
    { href: "/participate", label: "Participate" },
    { href: "/program", label: "Program" },
  ];

  return (
    <nav
      className={`sticky top-0 z-50 relative flex h-14 items-center justify-between border-b border-white/10 bg-black/90 px-6 backdrop-blur-md transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      {/* Left: Logo + Admin links */}
      <div className="flex items-center gap-1">
        <Link href="/" className="mr-3">
          <Image
            src="/logo_nettnett.jpg"
            alt="NettNett"
            width={110}
            height={36}
          />
        </Link>
        <Link
          href="/dashboard"
          className={`rounded px-3 py-1 text-sm transition-colors ${
            pathname === "/dashboard"
              ? "bg-white/10 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Dashboard
        </Link>
        <Link
          href="/management"
          className={`rounded px-3 py-1 text-sm transition-colors ${
            pathname === "/management"
              ? "bg-white/10 text-white"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Management
        </Link>
      </div>

      {/* Center: Mini Player (always centered) */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <NavMiniPlayer />
      </div>

      {/* Right: Public links + User */}
      <div className="flex items-center gap-1">
        {publicLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              pathname === link.href
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {link.label}
          </Link>
        ))}

        <span className="mx-1 text-white/10">|</span>

        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">{userName}</span>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {loggingOut ? "..." : "Logout"}
          </button>
        </div>
      </div>
    </nav>
  );
}
