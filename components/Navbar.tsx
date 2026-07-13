"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { canManageRole } from "@/lib/constants";

export type NavSession = {
  authenticated: boolean;
  user?: { firstName: string; lastName: string; role?: string };
};

const PUBLIC_LINKS = [
  { href: "/about", label: "About" },
  { href: "/curators", label: "Curators" },
  { href: "/participate", label: "Participate" },
  { href: "/program", label: "Program" },
];

const PROTECTED_PREFIXES = ["/dashboard", "/management", "/admin"];

// Single navbar for the whole app. The admin layout passes a server-known
// initialSession (no logged-out flash); public pages mount it bare and it
// fetches /api/auth/session itself (which returns the FRESH DB role, so
// link gating tracks role changes without re-login). Member links live in
// the user dropdown (desktop) / hamburger panel (mobile) — the nav no
// longer hosts the mini-player (see FloatingPlayer).
export default function Navbar({ initialSession }: { initialSession?: NavSession }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<NavSession | null>(initialSession ?? null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false); // mobile hamburger panel
  const [userMenuOpen, setUserMenuOpen] = useState(false); // desktop dropdown
  const lastScrollY = useRef(0);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  // Self-fetch the session when no server-known one was passed
  useEffect(() => {
    if (initialSession !== undefined) {
      setSession(initialSession);
      return;
    }
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then((res) => res.json())
      .then(setSession)
      .catch(() => {
        if (!controller.signal.aborted) setSession({ authenticated: false });
      });
    return () => controller.abort();
  }, [initialSession]);

  // Hide on scroll down, show on scroll up
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
        setUserMenuOpen(false);
      }

      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // User dropdown: close on outside mousedown / Escape (refocus the trigger)
  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) setUserMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        userButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // fall through — clear local state regardless
    }
    setSession({ authenticated: false });
    setMenuOpen(false);
    setUserMenuOpen(false);
    setLoggingOut(false);
    if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
      router.push("/");
    } else {
      router.refresh();
    }
  }

  const authenticated = session?.authenticated === true;
  const role = session?.user?.role;
  const userName = session?.user
    ? `${session.user.firstName} ${session.user.lastName}`
    : "";

  const desktopLinkClass = (href: string) =>
    `rounded px-3 py-1 text-sm transition-colors ${
      pathname === href
        ? "bg-white/10 text-white"
        : "text-white/50 hover:text-white/80"
    }`;

  const menuItemClass = (href: string, accent = false) =>
    `block px-3 py-2 text-sm transition-colors hover:bg-white/10 ${
      pathname === href
        ? accent
          ? "bg-yellow-500/20 text-yellow-300"
          : "bg-white/10 text-white"
        : accent
          ? "text-yellow-500/70 hover:text-yellow-400"
          : "text-white/60 hover:text-white"
    }`;

  const mobileItemClass = (href: string, accent = false) =>
    `rounded px-3 py-2.5 text-sm transition-colors ${
      pathname === href
        ? accent
          ? "bg-yellow-500/20 text-yellow-300"
          : "bg-white/10 text-white"
        : accent
          ? "text-yellow-500/70"
          : "text-white/60"
    }`;

  return (
    <>
      <nav
        className={`sticky top-0 z-50 flex h-16 md:h-14 items-center justify-between border-b border-white/10 bg-black/90 px-4 md:px-6 backdrop-blur-md transition-transform duration-300 ${
          visible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        {/* Left: Logo + public links (desktop) */}
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
            {PUBLIC_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={desktopLinkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right: user menu / login (desktop) */}
        <div className="hidden md:flex items-center gap-1">
          {session === null ? null : authenticated ? (
            <div className="relative" data-user-menu>
              <button
                ref={userButtonRef}
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                className="flex items-center gap-1.5 rounded border border-white/20 px-3 py-1 text-sm text-white/70 transition-colors hover:bg-white/10"
              >
                {userName}
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-white/15 bg-neutral-900 py-1 shadow-xl"
                >
                  <Link href="/dashboard" role="menuitem" className={menuItemClass("/dashboard")}>
                    Dashboard
                  </Link>
                  {canManageRole(role) && (
                    <Link href="/management" role="menuitem" className={menuItemClass("/management")}>
                      Management
                    </Link>
                  )}
                  {role === "admin" && (
                    <Link href="/admin" role="menuitem" className={menuItemClass("/admin", true)}>
                      Admin
                    </Link>
                  )}
                  <div className="my-1 border-t border-white/10" />
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="block w-full px-3 py-2 text-left text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    {loggingOut ? "..." : "Logout"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10"
            >
              Login
            </Link>
          )}
        </div>

        {/* Mobile: hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
          className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 md:hidden"
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
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && visible && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-white/10 bg-black/95 backdrop-blur-md md:hidden">
          <div className="flex flex-col px-4 py-3">
            {/* Member links */}
            {authenticated && (
              <div className="flex flex-col border-b border-white/10 pb-3 mb-3">
                <Link href="/dashboard" className={mobileItemClass("/dashboard")}>
                  Dashboard
                </Link>
                {canManageRole(role) && (
                  <Link href="/management" className={mobileItemClass("/management")}>
                    Management
                  </Link>
                )}
                {role === "admin" && (
                  <Link href="/admin" className={mobileItemClass("/admin", true)}>
                    Admin
                  </Link>
                )}
              </div>
            )}

            {/* Public links */}
            <div className="flex flex-col border-b border-white/10 pb-3 mb-3">
              {PUBLIC_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={mobileItemClass(link.href)}>
                  {link.label}
                </Link>
              ))}
            </div>

            {/* User section */}
            <div className="flex flex-col px-3">
              {session === null ? null : authenticated ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{userName}</span>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {loggingOut ? "..." : "Logout"}
                  </button>
                </div>
              ) : (
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
