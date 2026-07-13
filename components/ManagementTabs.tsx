"use client";

import { useState } from "react";
import NowPlayingControl from "./NowPlayingControl";
import PlaylistManager from "./PlaylistManager";
import ScheduleCalendar from "./ScheduleCalendar";
import StreamerManager from "./StreamerManager";
import UrlBroadcast from "./UrlBroadcast";
import RecordingsManager from "./RecordingsManager";

type Tab = "stream" | "broadcast" | "playlists" | "calendar" | "streamers" | "recordings";

const tabs: { id: Tab; label: string }[] = [
  { id: "stream", label: "Stream" },
  { id: "broadcast", label: "URL Broadcast" },
  { id: "playlists", label: "Playlists" },
  { id: "calendar", label: "Calendar" },
  { id: "streamers", label: "Streamers" },
  { id: "recordings", label: "Recordings" },
];

export default function ManagementTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("stream");

  return (
    <div>
      {/* Tab bar — scrollable on mobile, hidden scrollbar */}
      <div className="flex overflow-x-auto border-b border-white/10 mb-6 -mx-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-white text-white"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "stream" && <NowPlayingControl />}
      {activeTab === "broadcast" && <UrlBroadcast />}
      {activeTab === "playlists" && <PlaylistManager />}
      {activeTab === "calendar" && <ScheduleCalendar />}
      {activeTab === "streamers" && <StreamerManager />}
      {activeTab === "recordings" && <RecordingsManager />}
    </div>
  );
}
