"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Webcaster, WebcasterStatus } from "@/lib/webcaster";

const AZURACAST_URL = process.env.NEXT_PUBLIC_AZURACAST_URL || "";
const STATION_SHORTCODE = "nettnett";

interface LiveStudioProps {
  // DJ usernames for the picker (from the streamers list above)
  usernames: string[];
}

export default function LiveStudio({ usernames }: LiveStudioProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showTitle, setShowTitle] = useState("");
  const [status, setStatus] = useState<WebcasterStatus>("idle");
  const [errorDetail, setErrorDetail] = useState("");
  const [level, setLevel] = useState(0);
  const [hasSignal, setHasSignal] = useState(false);

  // Microphone setup state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState("");
  const [muted, setMuted] = useState(false);

  const casterRef = useRef<Webcaster | null>(null);
  const levelRef = useRef(0);
  const lastSignalAt = useRef(0);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewRafRef = useRef(0);

  const isLive = status === "live";
  const isConnecting = status === "connecting";

  /* ─── Mic preview (signal check before going live) ─── */

  const stopPreview = useCallback(() => {
    cancelAnimationFrame(previewRafRef.current);
    previewStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewCtxRef.current?.close().catch(() => {});
    previewStreamRef.current = null;
    previewCtxRef.current = null;
  }, []);

  const startPreview = useCallback(
    async (id?: string) => {
      stopPreview();
      setMicError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: id ? { deviceId: { exact: id } } : true,
        });
        previewStreamRef.current = stream;

        const ctx = new AudioContext();
        previewCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / (data.length / 4));
          const lvl = Math.min(1, rms * 3);
          levelRef.current = lvl;
          if (lvl > 0.03) lastSignalAt.current = Date.now();
          previewRafRef.current = requestAnimationFrame(loop);
        };
        loop();

        // Labels only become available after permission is granted
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput"
        );
        setDevices(inputs);
        if (!id) {
          const activeId = stream.getAudioTracks()[0]?.getSettings().deviceId;
          setDeviceId(activeId || inputs[0]?.deviceId || "");
        }
        setMicReady(true);
      } catch (e) {
        setMicReady(false);
        setMicError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission denied — allow it in your browser settings."
            : "Could not access the microphone."
        );
      }
    },
    [stopPreview]
  );

  const changeDevice = (id: string) => {
    setDeviceId(id);
    if (!isLive && !isConnecting) startPreview(id);
  };

  /* ─── Level meter + signal indicator (shared by preview and live) ─── */

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLevel(levelRef.current);
      setHasSignal(Date.now() - lastSignalAt.current < 1500);
      raf = requestAnimationFrame(tick);
    };
    if (micReady || isLive) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [micReady, isLive]);

  // Warn before leaving the page while on air
  useEffect(() => {
    if (!isLive) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isLive]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      casterRef.current?.stop();
      stopPreview();
    };
  }, [stopPreview]);

  /* ─── Broadcast controls ─── */

  const goLive = useCallback(async () => {
    if (!username.trim() || !password) {
      setErrorDetail("Enter the DJ username and password.");
      setStatus("error");
      return;
    }
    setErrorDetail("");
    setMuted(false);
    stopPreview(); // the broadcaster opens its own capture of the same device

    const wsUrl = `${AZURACAST_URL.replace(/^http/i, "ws")}/webdj/${STATION_SHORTCODE}/`;
    const caster = new Webcaster({
      url: wsUrl,
      username: username.trim(),
      password,
      bitrate: 192,
      deviceId: deviceId || undefined,
      onStatus: (s, detail) => {
        setStatus(s);
        setErrorDetail(detail || "");
        // Resume the mic preview when the session ends for any reason
        if (s === "stopped" || s === "error") startPreview(deviceId || undefined);
      },
      onLevel: (l) => {
        levelRef.current = l;
        if (l > 0.03) lastSignalAt.current = Date.now();
      },
    });
    casterRef.current = caster;

    try {
      await caster.start();
      if (showTitle.trim()) caster.sendMetadata(showTitle.trim());
    } catch (e) {
      caster.stop();
      setStatus("error");
      setErrorDetail(e instanceof Error ? e.message : "Could not start the broadcast");
    }
  }, [username, password, showTitle, deviceId, startPreview, stopPreview]);

  const endSession = useCallback(() => {
    casterRef.current?.stop();
    casterRef.current = null;
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    casterRef.current?.setMuted(next);
    setMuted(next);
  }, [muted]);

  const updateMetadata = useCallback(() => {
    if (showTitle.trim()) casterRef.current?.sendMetadata(showTitle.trim());
  }, [showTitle]);

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              ON AIR{muted ? " · MUTED" : ""}
            </span>
          ) : isConnecting ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/60">
              Connecting...
            </span>
          ) : (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/40">
              Off air
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <button
              onClick={toggleMute}
              className={`rounded border px-4 py-2 text-sm font-medium transition-colors ${
                muted
                  ? "border-yellow-500/50 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25"
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {muted ? "Unmute 🔇" : "Mute 🎤"}
            </button>
          )}
          {isLive ? (
            <button
              onClick={endSession}
              className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              End session
            </button>
          ) : (
            <button
              onClick={goLive}
              disabled={isConnecting || !micReady || !username.trim() || !password}
              className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Go Live 🎙️"}
            </button>
          )}
        </div>
      </div>

      {/* Microphone setup + signal check */}
      <div className="rounded border border-white/10 bg-white/5 p-3 space-y-3">
        {!micReady ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/50">
              Enable your microphone to pick an input and check the signal.
            </p>
            <button
              onClick={() => startPreview()}
              className="shrink-0 rounded border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Enable microphone
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-48">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/40">
                  Microphone
                </label>
                <select
                  value={deviceId}
                  onChange={(e) => changeDevice(e.target.value)}
                  disabled={isLive || isConnecting}
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40 disabled:opacity-50 [&>option]:bg-neutral-900"
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="shrink-0 pt-5">
                {hasSignal ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    Signal
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-white/30">
                    <span className="inline-block h-2 w-2 rounded-full bg-white/20" />
                    No signal
                  </span>
                )}
              </div>
            </div>

            {/* VU meter (preview + live) */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-75 ${
                  level > 0.85 ? "bg-red-500" : level > 0.6 ? "bg-yellow-400" : "bg-green-500"
                }`}
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
          </>
        )}
        {micError && <p className="text-sm text-red-400">{micError}</p>}
      </div>

      {/* Credentials */}
      {!isLive && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">
              DJ username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="djname"
              list="dj-usernames"
              disabled={isConnecting}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50"
            />
            <datalist id="dj-usernames">
              {usernames.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">
              DJ password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isConnecting}
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40 disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* Show title / metadata */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-white/80">
            Show title <span className="text-white/30">(optional, shows as now playing)</span>
          </label>
          <input
            type="text"
            value={showTitle}
            onChange={(e) => setShowTitle(e.target.value)}
            placeholder="e.g. Internal Sunshine ep. 70"
            maxLength={120}
            className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
          />
        </div>
        {isLive && (
          <button
            onClick={updateMetadata}
            disabled={!showTitle.trim()}
            className="rounded border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            Update
          </button>
        )}
      </div>

      {status === "error" && errorDetail && (
        <p className="text-sm text-red-400">{errorDetail}</p>
      )}
      {status === "stopped" && (
        <p className="text-sm text-green-400">
          Session ended — the recording is being saved to the cloud and will appear in the
          Recordings tab shortly.
        </p>
      )}

      <p className="text-[11px] text-white/25">
        The session is recorded automatically. Keep this tab open while broadcasting.
      </p>
    </div>
  );
}
