"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import NavMiniPlayer from "./NavMiniPlayer";

export default function PublicNavbar() {
  const [session, setSession] = useState<{ authenticated: boolean; user?: { firstName: string; lastName: string; role?: string } } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ authenticated: false });
    setLoggingOut(false);
    setMenuOpen(false);
    router.refresh();
  }

  const publicLinks = [
    { href: "/about", label: "About" },
    { href: "/curators", label: "Curators" },
    { href: "/participate", label: "Participate" },
    { href: "/program", label: "Program" },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 relative flex h-16 md:h-14 items-center justify-between border-b border-white/10 bg-black/90 px-4 md:px-6 backdrop-blur-md">
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
          {session?.authenticated && (
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
              {session.user?.role === "admin" && (
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
          )}
        </div>

        {/* Center: Mini Player */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
          <NavMiniPlayer />
        </div>

        {/* Right: Public links + User/Login (desktop) */}
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

          {session?.authenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/70">
                {session.user?.firstName} {session.user?.lastName}
              </span>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {loggingOut ? "..." : "Logout"}
              </button>
            </div>
          ) : session === null ? null : (
            <Link
              href="/login"
              className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10"
            >
              Login
            </Link>
          )}
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
      {menuOpen && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-black/95 backdrop-blur-md md:hidden">
          <div className="flex flex-col px-4 py-3">
            {/* Admin links */}
            {session?.authenticated && (
              <div className="flex flex-col border-b border-white/10 pb-3 mb-3">
                <Link
                  href="/dashboard"
                  className={`rounded px-3 py-2.5 text-sm transition-colors ${
                    pathname === "/dashboard" ? "bg-white/10 text-white" : "text-white/60"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/management"
                  className={`rounded px-3 py-2.5 text-sm transition-colors ${
                    pathname === "/management" ? "bg-white/10 text-white" : "text-white/60"
                  }`}
                >
                  Management
                </Link>
                {session.user?.role === "admin" && (
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
            )}

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
            <div className="flex flex-col px-3">
              {session?.authenticated ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">
                    {session.user?.firstName} {session.user?.lastName}
                  </span>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {loggingOut ? "..." : "Logout"}
                  </button>
                </div>
              ) : session === null ? null : (
                <Link
                  href="/login"
                  className="rounded border border-white/20 px-3 py-2 text-center text-sm transition-colors hover:bg-white/10"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
