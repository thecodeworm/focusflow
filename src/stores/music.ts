// Music state + controller for the dashboard window (the only window that
// plays media). The floating widget receives a summary via `music://status`.
import { create } from "zustand";
import { audioErrorMessage, parseMediaUrl, youtubeErrorMessage, type MediaSource } from "@/lib/media-url";
import { focusSounds, type NoiseKind } from "@/services/noise";
import { YouTubeBridge, type PlayerInbound } from "@/services/youtube-bridge";
import { useApp } from "./app";

export type MusicPhase = "idle" | "loading" | "playing" | "paused" | "buffering" | "blocked" | "error";

type Loaded = Exclude<MediaSource, { kind: "error" }>;

interface MusicStore {
  source: Loaded | null;
  phase: MusicPhase;
  title: string;
  author: string;
  duration: number;
  position: number;
  seekable: boolean;
  /** Live stream: no meaningful duration or seeking. */
  live: boolean;
  muted: boolean;
  error: string | null;
  playlistIndex: number;
  playlistLength: number;
  noise: NoiseKind | null;
  noisePlaying: boolean;
}

const initial: MusicStore = {
  source: null,
  phase: "idle",
  title: "",
  author: "",
  duration: 0,
  position: 0,
  seekable: false,
  live: false,
  muted: false,
  error: null,
  playlistIndex: -1,
  playlistLength: 0,
  noise: null,
  noisePlaying: false,
};

export const useMusic = create<MusicStore>()(() => ({ ...initial }));

const set = (p: Partial<MusicStore>) => useMusic.setState(p);
const get = () => useMusic.getState();
const settings = () => useApp.getState().settings!;

// ---- Direct audio ----------------------------------------------------------

let audio: HTMLAudioElement | null = null;
let lastSecond = -1;

function releaseAudio() {
  if (!audio) return;
  const a = audio;
  audio = null;
  a.pause();
  a.removeAttribute("src");
  a.load(); // releases the network connection and decoder
}

function attachAudio(src: Extract<Loaded, { kind: "audio" }>) {
  releaseAudio();
  const a = new Audio();
  a.preload = "auto";
  a.volume = settings().audio.musicVolume;
  a.muted = get().muted;
  a.loop = settings().audio.loopMusic;
  a.addEventListener("loadedmetadata", () => {
    if (audio !== a) return;
    const finite = Number.isFinite(a.duration) && a.duration > 0;
    set({ duration: finite ? a.duration : 0, seekable: finite && a.seekable.length > 0 });
  });
  a.addEventListener("timeupdate", () => {
    if (audio !== a) return;
    const s = Math.floor(a.currentTime);
    if (s !== lastSecond) {
      lastSecond = s;
      set({ position: a.currentTime });
    }
  });
  a.addEventListener("playing", () => audio === a && set({ phase: "playing", error: null }));
  a.addEventListener("pause", () => audio === a && !a.ended && get().phase !== "error" && set({ phase: "paused" }));
  a.addEventListener("waiting", () => audio === a && set({ phase: "buffering" }));
  a.addEventListener("ended", () => audio === a && set({ phase: "paused", position: 0 }));
  a.addEventListener("error", () => {
    if (audio !== a) return;
    const msg = navigator.onLine ? audioErrorMessage(a.error?.code, src.likelyAudio) : "You're offline. Online music needs an internet connection; focus sounds still work.";
    set({ phase: "error", error: msg });
  });
  a.src = src.url;
  audio = a;
  return a;
}

async function playAudio() {
  if (!audio) return;
  try {
    await audio.play();
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError") set({ phase: "blocked", error: null });
    else if (name !== "AbortError" && get().phase !== "error") set({ phase: "error", error: "The audio couldn't start." });
  }
}

// ---- YouTube ---------------------------------------------------------------

let bridge: YouTubeBridge | null = null;
let readyTimeout = 0;
let pausedByHide = false;

function onPlayer(m: PlayerInbound) {
  switch (m.type) {
    case "hello":
      if (m.apiFailed) failYouTube();
      break;
    case "ready":
      window.clearTimeout(readyTimeout);
      break;
    case "api-failed":
      failYouTube();
      break;
    case "autoplay-blocked":
      if (get().phase !== "playing") set({ phase: "blocked" });
      break;
    case "error":
      window.clearTimeout(readyTimeout);
      set({ phase: "error", error: youtubeErrorMessage(m.code) });
      break;
    case "status": {
      window.clearTimeout(readyTimeout);
      const phase: MusicPhase =
        m.state === 1 ? "playing" : m.state === 3 ? "buffering" : m.state === 2 || m.state === 0 ? "paused" : get().phase === "blocked" ? "blocked" : "loading";
      // Live streams report a zero (or ever-growing DVR) duration, so a seek
      // bar would be wrong. Once live, stay live through the "ended" state so
      // we can say the stream finished rather than show a stale timeline.
      const live = m.live === true || (get().live && m.state === 0);
      set({
        live,
        phase: get().phase === "error" && m.state !== 1 ? "error" : phase,
        error: m.state === 1 ? null : get().error,
        // Only show metadata YouTube actually reported.
        title: m.title || get().title,
        author: m.author || get().author,
        duration: live ? 0 : m.duration || 0,
        position: live ? 0 : m.currentTime || 0,
        seekable: !live && (m.duration || 0) > 0,
        muted: m.muted,
        playlistIndex: m.playlistIndex,
        playlistLength: m.playlistLength,
      });
      break;
    }
  }
}

function failYouTube() {
  window.clearTimeout(readyTimeout);
  set({
    phase: "error",
    error: navigator.onLine ? "Couldn't reach YouTube. Check your connection and try again." : "You're offline. YouTube needs an internet connection.",
  });
}

/** Called by the stage component once the host iframe has loaded. */
export function attachPlayerFrame(frame: HTMLIFrameElement) {
  const origin = useApp.getState().playerOrigin;
  if (!origin) return;
  if (!bridge) bridge = new YouTubeBridge(origin, onPlayer);
  bridge.attach(frame);
  const src = get().source;
  if (src?.kind === "youtube") sendYouTubeLoad(src);
}

function sendYouTubeLoad(src: Extract<Loaded, { kind: "youtube" }>) {
  const s = settings();
  bridge?.post({
    type: "load",
    videoId: src.videoId,
    listId: src.listId,
    channelId: src.channelId,
    start: src.start,
    volume: Math.round(s.audio.musicVolume * 100),
    muted: get().muted,
    loop: s.audio.loopMusic,
  });
  window.clearTimeout(readyTimeout);
  readyTimeout = window.setTimeout(() => {
    if (get().phase === "loading") failYouTube();
  }, 20000);
}

export function detachPlayerFrame() {
  bridge?.dispose();
  bridge = null;
  window.clearTimeout(readyTimeout);
}

// ---- Public controller -----------------------------------------------------

export const music = {
  /** Parses and starts a pasted link. Returns an error message, if any. */
  open(input: string): string | null {
    const parsed = parseMediaUrl(input);
    if (parsed.kind === "error") return parsed.message;
    if (!navigator.onLine) return "You're offline. Online music needs an internet connection; focus sounds still work.";
    this.load(parsed);
    return null;
  },

  load(src: Loaded) {
    pausedByHide = false;
    lastSecond = -1;
    if (src.kind === "audio") {
      bridge?.post({ type: "stop" });
      set({ ...pick(), source: src, phase: "loading", title: src.name, author: "", error: null });
      attachAudio(src);
      void playAudio();
    } else {
      releaseAudio();
      if (!useApp.getState().playerOrigin) {
        set({ ...pick(), source: src, phase: "error", error: "Ringlet's YouTube player host couldn't start. Restart Ringlet and try again." });
        return;
      }
      const same = get().source?.kind === "youtube";
      set({ ...pick(), source: src, phase: "loading", title: "", author: "", error: null });
      // If the stage is already mounted, load straight away; otherwise the
      // stage calls attachPlayerFrame when its iframe is ready.
      if (same && bridge) sendYouTubeLoad(src);
    }
  },

  play() {
    const src = get().source;
    pausedByHide = false;
    if (src?.kind === "audio") void playAudio();
    else if (src?.kind === "youtube") bridge?.post({ type: "play" });
  },

  pause() {
    const src = get().source;
    if (src?.kind === "audio") audio?.pause();
    else if (src?.kind === "youtube") bridge?.post({ type: "pause" });
  },

  toggle() {
    const p = get().phase;
    if (p === "playing" || p === "buffering") this.pause();
    else this.play();
  },

  stop() {
    releaseAudio();
    bridge?.post({ type: "stop" });
    pausedByHide = false;
    set({ ...pick(), source: null, phase: "idle", error: null, title: "", author: "" });
  },

  seek(seconds: number) {
    const src = get().source;
    if (get().live) return;
    if (src?.kind === "audio" && audio) audio.currentTime = seconds;
    else if (src?.kind === "youtube") bridge?.post({ type: "seek", seconds });
    set({ position: seconds });
  },

  setVolume(v: number) {
    if (audio) audio.volume = v;
    bridge?.post({ type: "volume", value: Math.round(v * 100) });
  },

  setMuted(m: boolean) {
    if (audio) audio.muted = m;
    bridge?.post({ type: "mute", muted: m });
    set({ muted: m });
  },

  setLoop(loop: boolean) {
    if (audio) audio.loop = loop;
    bridge?.post({ type: "loop", loop });
  },

  next: () => bridge?.post({ type: "next" }),
  previous: () => bridge?.post({ type: "previous" }),

  /** Pause YouTube while the dashboard is hidden (compliant default). */
  onVisibility(visible: boolean) {
    const s = get();
    if (!visible && s.source?.kind === "youtube" && (s.phase === "playing" || s.phase === "buffering") && settings().desktop.pauseVideoWhenHidden) {
      pausedByHide = true;
      bridge?.post({ type: "pause" });
    } else if (visible && pausedByHide) {
      pausedByHide = false;
      bridge?.post({ type: "play" });
    }
  },

  // ---- focus sounds ----
  async toggleNoise(kind: NoiseKind) {
    const s = get();
    if (s.noise === kind && s.noisePlaying) {
      focusSounds.stop();
      set({ noisePlaying: false });
      return;
    }
    focusSounds.setVolume(settings().audio.focusSoundVolume);
    try {
      await focusSounds.play(kind);
      set({ noise: kind, noisePlaying: true });
    } catch {
      set({ noisePlaying: false });
    }
  },

  stopNoise() {
    focusSounds.stop();
    set({ noisePlaying: false });
  },

  setNoiseVolume(v: number) {
    focusSounds.setVolume(v);
  },
};

/** Fields reset whenever a new source loads. */
function pick(): Partial<MusicStore> {
  return { duration: 0, position: 0, seekable: false, live: false, playlistIndex: -1, playlistLength: 0 };
}
