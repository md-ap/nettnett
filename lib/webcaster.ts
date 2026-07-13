// Browser-side live broadcaster for AzuraCast (Webcast protocol).
// Captures the microphone, encodes MP3 in the browser (lamejs) and streams
// it over a WebSocket to Liquidsoap's harbor input — the same protocol the
// official AzuraCast Web DJ uses (subprotocol "webcast"):
//   1. hello frame (JSON): mime + audio params + DJ credentials
//   2. binary frames: raw MP3 bytes
//   3. optional metadata frames (JSON)
// Endpoint (behind AzuraCast's web proxy): wss://{host}/webdj/{station}/

import { Mp3Encoder } from "@breezystack/lamejs";

export type WebcasterStatus = "idle" | "connecting" | "live" | "stopped" | "error";

export interface WebcasterOptions {
  url: string; // wss://.../webdj/{station}/
  username: string;
  password: string;
  bitrate?: number; // kbps, default 192
  deviceId?: string; // specific microphone to use
  onStatus?: (status: WebcasterStatus, detail?: string) => void;
  onLevel?: (level: number) => void; // 0..1 input level (RMS-ish)
}

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class Webcaster {
  private opts: WebcasterOptions;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private encoder: Mp3Encoder | null = null;
  private ws: WebSocket | null = null;
  private stopping = false;

  constructor(opts: WebcasterOptions) {
    this.opts = { bitrate: 192, ...opts };
  }

  async start(): Promise<void> {
    this.opts.onStatus?.("connecting");
    this.stopping = false;

    // 1. Microphone — disable browser processing (better for music/voice mix)
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(this.opts.deviceId ? { deviceId: { exact: this.opts.deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
    });

    // 2. Audio pipeline: mic → processor (encode) → muted gain → destination
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 2, 2);
    // A node must reach the destination for onaudioprocess to fire, but we
    // mute it so the DJ doesn't hear their own mic echoed back
    this.silentGain = this.ctx.createGain();
    this.silentGain.gain.value = 0;

    const sampleRate = this.ctx.sampleRate;
    this.encoder = new Mp3Encoder(2, sampleRate, this.opts.bitrate!);

    // 3. WebSocket handshake (webcast protocol)
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.opts.url, "webcast");
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "hello",
            data: {
              mime: "audio/mpeg",
              audio: {
                channels: 2,
                samplerate: sampleRate,
                bitrate: this.opts.bitrate,
                encoder: "libmp3lame",
              },
              user: this.opts.username,
              password: this.opts.password,
            },
          })
        );
        settled = true;
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("Could not connect to the station"));
        }
      };
      this.ws = ws;
    });

    if (!this.ws) throw new Error("Connection was not established");

    // Closed by the server mid-session = auth failure or network drop
    this.ws.onclose = () => {
      if (!this.stopping) {
        this.teardownAudio();
        this.opts.onStatus?.(
          "error",
          "Connection closed by the station — check the DJ username/password and that the account is active."
        );
      }
    };

    // 4. Pump: capture → level meter → MP3 → WebSocket
    this.processor.onaudioprocess = (e) => {
      const left = e.inputBuffer.getChannelData(0);
      const right =
        e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;

      if (this.opts.onLevel) {
        let sum = 0;
        for (let i = 0; i < left.length; i += 32) sum += left[i] * left[i];
        const rms = Math.sqrt(sum / (left.length / 32));
        this.opts.onLevel(Math.min(1, rms * 3));
      }

      if (this.ws?.readyState === WebSocket.OPEN && this.encoder) {
        const mp3 = this.encoder.encodeBuffer(floatTo16(left), floatTo16(right));
        if (mp3.length > 0) this.ws.send(mp3);
      }
    };

    source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.ctx.destination);

    this.opts.onStatus?.("live");
  }

  sendMetadata(title: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "metadata", data: { title } }));
    }
  }

  // Mute = the mic track produces silence (connection and recording continue)
  setMuted(muted: boolean): void {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop(): void {
    this.stopping = true;
    // Flush the encoder's remaining frames before closing
    if (this.ws?.readyState === WebSocket.OPEN && this.encoder) {
      const rest = this.encoder.flush();
      if (rest.length > 0) this.ws.send(rest);
      this.ws.close(1000);
    } else {
      this.ws?.close();
    }
    this.teardownAudio();
    this.opts.onStatus?.("stopped");
  }

  private teardownAudio(): void {
    try {
      this.processor?.disconnect();
      this.silentGain?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.ctx?.close();
    } catch {
      // best-effort cleanup
    }
    this.processor = null;
    this.silentGain = null;
    this.stream = null;
    this.ctx = null;
    this.encoder = null;
  }
}
