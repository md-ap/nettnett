"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import RadioPlayer from "@/components/RadioPlayer";

export default function HomePage() {
  const [albumArt, setAlbumArt] = useState<string | null>(null);

  const handleAlbumArtChange = useCallback((artUrl: string | null) => {
    setAlbumArt(artUrl);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
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

        {/* Admin link */}
        <Link
          href="/login"
          className="text-xs text-white/20 transition-colors hover:text-white/50"
        >
          Admin Login
        </Link>
      </div>
    </div>
  );
}
