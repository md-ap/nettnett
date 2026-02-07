"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";

type GateState =
  | "loading"
  | "denied"
  | "confirm_entry"
  | "takeover_prompt"
  | "active"
  | "kicked"
  | "inactive_timeout";

interface ActiveSessionInfo {
  userId: string;
  userName: string;
  startedAt: string;
  lastActivity: string;
}

interface KickedByInfo {
  userId: string;
  userName: string;
}

const HEARTBEAT_INTERVAL = 15_000;
const KICK_CHECK_INTERVAL = 5_000;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

export default function ManagementGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("loading");
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);
  const [kickedBy, setKickedBy] = useState<KickedByInfo | null>(null);
  const [claiming, setClaiming] = useState(false);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const kickCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);

  // Check initial session state
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/management/session");
      const data = await res.json();

      if (!res.ok || data.hasPermission === false) {
        setState("denied");
        return;
      }

      if (!data.activeSession) {
        setState("confirm_entry");
      } else if (data.isCurrentUser) {
        // Same user, re-entering (e.g., page reload)
        setState("active");
        isActiveRef.current = true;
        startPolling();
        startInactivityTimer();
      } else {
        setActiveSession(data.activeSession);
        setState("takeover_prompt");
      }
    } catch {
      setState("denied");
    }
  }, []);

  // Claim session
  const claimSession = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/management/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });

      if (res.ok) {
        setState("active");
        isActiveRef.current = true;
        startPolling();
        startInactivityTimer();
      }
    } catch {
      // Failed to claim
    } finally {
      setClaiming(false);
    }
  }, []);

  // Release session
  const releaseSession = useCallback(() => {
    isActiveRef.current = false;
    fetch("/api/management/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release" }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Start heartbeat and kick-check polling
  function startPolling() {
    stopPolling();

    heartbeatRef.current = setInterval(async () => {
      if (!isActiveRef.current) return;
      try {
        const res = await fetch("/api/management/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
        });
        const data = await res.json();
        if (data.kicked) {
          handleKicked();
        }
      } catch {
        // Network error, will retry next interval
      }
    }, HEARTBEAT_INTERVAL);

    kickCheckRef.current = setInterval(async () => {
      if (!isActiveRef.current) return;
      try {
        const res = await fetch("/api/management/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check-kicked" }),
        });
        const data = await res.json();
        if (data.kicked && data.kickedBy) {
          setKickedBy(data.kickedBy);
          handleKicked();
        }
      } catch {
        // Network error, will retry next interval
      }
    }, KICK_CHECK_INTERVAL);
  }

  function stopPolling() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (kickCheckRef.current) {
      clearInterval(kickCheckRef.current);
      kickCheckRef.current = null;
    }
  }

  function handleKicked() {
    isActiveRef.current = false;
    stopPolling();
    stopInactivityTimer();
    setState("kicked");
  }

  // Inactivity tracking
  function startInactivityTimer() {
    stopInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (!isActiveRef.current) return;
      isActiveRef.current = false;
      stopPolling();
      releaseSession();
      setState("inactive_timeout");
    }, INACTIVITY_TIMEOUT);
  }

  function stopInactivityTimer() {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }

  function resetInactivityTimer() {
    if (isActiveRef.current) {
      startInactivityTimer();
    }
  }

  // Activity listeners
  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    const handler = () => resetInactivityTimer();

    events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler));
    };
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Cleanup on unmount and beforeunload
  useEffect(() => {
    function handleBeforeUnload() {
      if (isActiveRef.current) {
        navigator.sendBeacon(
          "/api/management/session",
          new Blob([JSON.stringify({ action: "release" })], {
            type: "application/json",
          })
        );
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopPolling();
      stopInactivityTimer();
      if (isActiveRef.current) {
        releaseSession();
      }
    };
  }, [releaseSession]);

  // Go back to dashboard
  function goBack() {
    router.push("/dashboard");
  }

  // Loading state
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  // Denied state
  if (state === "denied") {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-full max-w-md text-center">
          <p className="mb-2 text-lg font-semibold text-white">Access Denied</p>
          <p className="mb-6 text-sm text-white/50">
            You don&apos;t have permission to access radio management.
            Contact an admin to request access.
          </p>
          <button
            onClick={goBack}
            className="rounded border border-white/20 px-6 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Confirm entry overlay (no one using management)
  if (state === "confirm_entry") {
    return (
      <Overlay
        title="Radio Management"
        message="You're about to manage the radio stream. While active, other users will see that you're in control. Proceed?"
        yesLabel="Proceed"
        noLabel="Cancel"
        loading={claiming}
        onYes={claimSession}
        onNo={goBack}
      />
    );
  }

  // Takeover prompt (someone else is active)
  if (state === "takeover_prompt") {
    return (
      <Overlay
        title="Management In Use"
        message={`${activeSession?.userName || "Another user"} is currently managing the radio stream. Do you want to take over?`}
        yesLabel="Take Over"
        noLabel="Cancel"
        loading={claiming}
        onYes={claimSession}
        onNo={goBack}
      />
    );
  }

  // Kicked overlay
  if (state === "kicked") {
    return (
      <Overlay
        title="Session Taken Over"
        message={`${kickedBy?.userName || "Another user"} has taken over radio management. Do you want to take it back?`}
        yesLabel="Take Over"
        noLabel="Leave"
        loading={claiming}
        onYes={claimSession}
        onNo={goBack}
      />
    );
  }

  // Inactive timeout overlay
  if (state === "inactive_timeout") {
    return (
      <Overlay
        title="Session Expired"
        message="You've been disconnected due to inactivity. Do you want to reconnect?"
        yesLabel="Reconnect"
        noLabel="Leave"
        loading={claiming}
        onYes={async () => {
          // Re-check if someone else claimed while we were idle
          try {
            const res = await fetch("/api/management/session");
            const data = await res.json();
            if (data.activeSession && !data.isCurrentUser) {
              setActiveSession(data.activeSession);
              setState("takeover_prompt");
              return;
            }
          } catch {
            // Fall through to claim
          }
          claimSession();
        }}
        onNo={goBack}
      />
    );
  }

  // Active state - render management content
  return <>{children}</>;
}

/* ─── Overlay Component ─── */
function Overlay({
  title,
  message,
  yesLabel = "Yes",
  noLabel = "No",
  loading = false,
  onYes,
  onNo,
}: {
  title: string;
  message: string;
  yesLabel?: string;
  noLabel?: string;
  loading?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/20 bg-black p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-white">{title}</h2>
        <p className="mb-6 text-sm text-white/60">{message}</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={onNo}
            disabled={loading}
            className="rounded border border-white/20 px-6 py-2 text-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {noLabel}
          </button>
          <button
            onClick={onYes}
            disabled={loading}
            className="rounded bg-white/10 px-6 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                ...
              </span>
            ) : (
              yesLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
