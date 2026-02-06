"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

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
        // Always show at top of page
        setVisible(true);
      } else if (currentY < lastScrollY.current) {
        // Scrolling up → show
        setVisible(true);
      } else if (currentY > lastScrollY.current) {
        // Scrolling down → hide
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

  return (
    <nav
      className={`sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-black/90 px-6 backdrop-blur-md transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <Image
        src="/logo_nettnett.jpg"
        alt="NettNett"
        width={110}
        height={36}
      />
      <div className="flex items-center gap-4">
        {/* Navigation links */}
        <div className="flex items-center gap-1">
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

        <div className="h-4 w-px bg-white/10" />

        <span className="text-sm text-white/70">Welcome, {userName}</span>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {loggingOut ? "..." : "Logout"}
        </button>
      </div>
    </nav>
  );
}
