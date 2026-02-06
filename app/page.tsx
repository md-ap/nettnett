"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RadioPlayer from "@/components/RadioPlayer";

export default function HomePage() {
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [session, setSession] = useState<{ authenticated: boolean; user?: { firstName: string; lastName: string } } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const handleAlbumArtChange = useCallback((artUrl: string | null) => {
    setAlbumArt(artUrl);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ authenticated: false });
    setLoggingOut(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/10 bg-black/90 px-6 backdrop-blur-md">
        <Image
          src="/logo_nettnett.jpg"
          alt="NettNett"
          width={110}
          height={36}
        />
        <div className="flex items-center gap-4">
          {session?.authenticated ? (
            <>
              <div className="flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className="rounded px-3 py-1 text-sm text-white/50 hover:text-white/80"
                >
                  Dashboard
                </Link>
                <Link
                  href="/management"
                  className="rounded px-3 py-1 text-sm text-white/50 hover:text-white/80"
                >
                  Management
                </Link>
              </div>
              <div className="h-4 w-px bg-white/10" />
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
            </>
          ) : session === null ? null : (
            <Link
              href="/login"
              className="rounded border border-white/20 px-3 py-1 text-sm transition-colors hover:bg-white/10"
            >
              Login
            </Link>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-10">
          {/* Logo or Album Art */}
          {albumArt ? (
            <div className="relative h-[200px] w-[200px] overflow-hidden rounded-lg shadow-2xl shadow-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={albumArt}
                alt="Now Playing"
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <Image
              src="/logo_nettnett.jpg"
              alt="NettNett"
              width={200}
              height={66}
              priority
            />
          )}

          {/* Radio Player */}
          <RadioPlayer onAlbumArtChange={handleAlbumArtChange} />
        </div>
      </div>
    </div>
  );
}
