// postMessage bridge to the YouTube host page (served from 127.0.0.1 by the
// Rust side). Messages are only accepted from that exact origin and frame.

export type PlayerInbound =
  | { type: "hello"; apiReady: boolean; apiFailed?: boolean }
  | { type: "ready" }
  | {
      type: "status";
      state: number;
      currentTime: number;
      duration: number;
      volume: number;
      muted: boolean;
      title: string;
      author: string;
      videoId: string;
      playlistIndex: number;
      playlistLength: number;
    }
  | { type: "error"; code: number }
  | { type: "autoplay-blocked" }
  | { type: "api-failed" };

export type PlayerOutbound =
  | { type: "hello" }
  | { type: "load"; videoId: string | null; listId: string | null; start: number; volume: number; muted: boolean; loop: boolean }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "seek"; seconds: number }
  | { type: "volume"; value: number }
  | { type: "mute"; muted: boolean }
  | { type: "loop"; loop: boolean }
  | { type: "next" }
  | { type: "previous" };

export class YouTubeBridge {
  private frame: HTMLIFrameElement | null = null;
  private connected = false;
  private queue: PlayerOutbound[] = [];
  private helloTimer = 0;
  private readonly onMessage: (e: MessageEvent) => void;

  constructor(
    private readonly origin: string,
    private readonly handler: (m: PlayerInbound) => void,
  ) {
    this.onMessage = (e: MessageEvent) => {
      if (e.origin !== this.origin || !this.frame || e.source !== this.frame.contentWindow) return;
      const data = e.data as { source?: string; type?: string } | null;
      if (!data || data.source !== "ringlet-player" || typeof data.type !== "string") return;
      if (data.type === "hello") {
        this.connected = true;
        window.clearInterval(this.helloTimer);
        const q = this.queue;
        this.queue = [];
        q.forEach((m) => this.post(m));
      }
      this.handler(data as PlayerInbound);
    };
    window.addEventListener("message", this.onMessage);
  }

  attach(frame: HTMLIFrameElement) {
    this.frame = frame;
    this.connected = false;
    // The page may not be listening yet when `load` fires; retry briefly.
    window.clearInterval(this.helloTimer);
    let tries = 0;
    this.helloTimer = window.setInterval(() => {
      if (this.connected || ++tries > 40) {
        window.clearInterval(this.helloTimer);
        return;
      }
      this.raw({ type: "hello" });
    }, 250);
    this.raw({ type: "hello" });
  }

  private raw(m: PlayerOutbound) {
    this.frame?.contentWindow?.postMessage({ ...m, target: "ringlet-player" }, this.origin);
  }

  post(m: PlayerOutbound) {
    if (!this.connected) {
      // Only the latest load matters.
      if (m.type === "load") this.queue = this.queue.filter((q) => q.type !== "load");
      this.queue.push(m);
      return;
    }
    this.raw(m);
  }

  dispose() {
    window.clearInterval(this.helloTimer);
    window.removeEventListener("message", this.onMessage);
    this.frame = null;
    this.queue = [];
  }
}
