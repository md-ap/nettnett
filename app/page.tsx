"use client";

import Image from "next/image";
import RadioPlayer from "@/components/RadioPlayer";
import PublicNavbar from "@/components/PublicNavbar";
import { useRadio } from "@/components/RadioProvider";

export default function HomePage() {
  const { albumArt } = useRadio();

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center px-4 pt-[12vh]">
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
            <div className="relative h-[200px] w-[200px] overflow-hidden rounded-lg shadow-2xl shadow-white/5">
              <Image
                src="/placeholder.webp"
                alt="NettNett"
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Radio Player */}
          <RadioPlayer />
        </div>
      </div>
    </div>
  );
}
