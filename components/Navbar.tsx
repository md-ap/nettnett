"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import NavMiniPlayer from "./NavMiniPlayer";

export default function Navbar({ userName, isAdmin = false, canManage = false }: { userName: string; isAdmin?: boolean; canManage?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
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
        setMenuOpen(false);
      }

      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
    <>
      <nav
        className={`sticky top-0 z-50 relative flex h-16 md:h-14 items-center justify-between border-b border-white/10 bg-black/90 px-4 md:px-6 backdrop-blur-md transition-transform duration-300 ${
          visible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Left: Logo + Admin links (desktop) */}
        <div className="flex items-center gap-1">
          <Link href="/" className="mr-3">
            <Image
              src="/logo_nettnett.jpg"
              alt="NettNett"
              width={110}
              height={36}
            />
          </Link>
          <div className="hidden md:flex items-center gap-1">
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
            {(isAdmin || canManage) && (
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
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  pathname === "/admin"
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "text-yellow-500/70 hover:text-yellow-400"
                }`}
              >
                Admin
              </Link>
            )}
          </div>
        </div>

        {/* Center: Mini Player (desktop) */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
          <NavMiniPlayer />
        </div>

        {/* Right: Public links + User (desktop) */}
        <div className="hidden md:flex items-center gap-1">
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

        {/* Mobile: Mini Player + Hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          <NavMiniPlayer />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && visible && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-black/95 backdrop-blur-md md:hidden">
          <div className="flex flex-col px-4 py-3">
            {/* Admin links */}
            <div className="flex flex-col border-b border-white/10 pb-3 mb-3">
              <Link
                href="/dashboard"
                className={`rounded px-3 py-2.5 text-sm transition-colors ${
                  pathname === "/dashboard" ? "bg-white/10 text-white" : "text-white/60"
                }`}
              >
                Dashboard
              </Link>
              {(isAdmin || canManage) && (
                <Link
                  href="/management"
                  className={`rounded px-3 py-2.5 text-sm transition-colors ${
                    pathname === "/management" ? "bg-white/10 text-white" : "text-white/60"
                  }`}
                >
                  Management
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`rounded px-3 py-2.5 text-sm transition-colors ${
                    pathname === "/admin" ? "bg-yellow-500/20 text-yellow-300" : "text-yellow-500/70"
                  }`}
                >
                  Admin
                </Link>
              )}
            </div>

            {/* Public links */}
            <div className="flex flex-col border-b border-white/10 pb-3 mb-3">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded px-3 py-2.5 text-sm transition-colors ${
                    pathname === link.href ? "bg-white/10 text-white" : "text-white/60"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* User section */}
            <div className="flex items-center justify-between px-3">
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
        </div>
      )}
    </>
  );
}
