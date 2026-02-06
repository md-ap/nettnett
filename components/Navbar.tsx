"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Navbar({ userName }: { userName: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <nav className="flex items-center justify-between border-b border-white/10 px-6 py-4">
      <Image
        src="/logo_nettnett.jpg"
        alt="NettNett"
        width={120}
        height={40}
      />
      <div className="flex items-center gap-4">
        <span className="text-sm text-white/80">{userName}</span>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded border border-white/20 px-4 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {loggingOut ? "..." : "Logout"}
        </button>
      </div>
    </nav>
  );
}
