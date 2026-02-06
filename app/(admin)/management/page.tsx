import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import NowPlayingControl from "@/components/NowPlayingControl";
import PlaylistManager from "@/components/PlaylistManager";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">
        Radio Management
      </h1>

      {/* Now Playing controls */}
      <NowPlayingControl />

      {/* Playlist & Media Manager */}
      <PlaylistManager />
    </div>
  );
}
