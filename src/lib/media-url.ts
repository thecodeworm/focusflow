// Strict parsing of user-pasted music links. Nothing pasted is ever executed
// or injected; we only extract validated identifiers / HTTPS URLs.

export type MediaSource =
  | { kind: "youtube"; videoId: string | null; listId: string | null; start: number; canonical: string }
  | { kind: "audio"; url: string; name: string; likelyAudio: boolean }
  | { kind: "error"; message: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const AUDIO_EXT = new Set(["mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "flac", "webm", "weba", "mp4", "m3u8"]);

const WEBPAGE_HOSTS: Record<string, string> = {
  "open.spotify.com": "Spotify",
  "spotify.com": "Spotify",
  "soundcloud.com": "SoundCloud",
  "music.apple.com": "Apple Music",
  "tidal.com": "Tidal",
  "deezer.com": "Deezer",
  "bandcamp.com": "Bandcamp",
};

/** Parses "90", "90s", "1m30s", "1h2m3s" into seconds. */
export function parseStartTime(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Math.min(86400, Number(t));
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  const secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return Math.min(86400, secs);
}

function toUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  // Allow pasting "youtube.com/watch?v=…" without a scheme.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function youtube(url: URL): MediaSource | null {
  const host = url.hostname.toLowerCase();
  let videoId: string | null;
  const listParam = url.searchParams.get("list");
  const listId = listParam && LIST_ID.test(listParam) ? listParam : null;
  const start = parseStartTime(url.searchParams.get("t") ?? url.searchParams.get("start"));

  if (host === "youtu.be") {
    videoId = url.pathname.split("/")[1] ?? null;
  } else if (YT_HOSTS.has(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") videoId = url.searchParams.get("v");
    else if (parts[0] === "playlist") videoId = null;
    else if (["live", "shorts", "embed", "v", "e"].includes(parts[0] ?? "")) videoId = parts[1] ?? null;
    else return { kind: "error", message: "That YouTube link isn't a video or playlist. Paste a link to a specific video, live stream or playlist." };
  } else {
    return null;
  }

  if (videoId !== null && !VIDEO_ID.test(videoId)) {
    return { kind: "error", message: "That YouTube link has an invalid video ID. Copy the link again from the Share button." };
  }
  if (!videoId && !listId) {
    return { kind: "error", message: listParam ? "That playlist ID doesn't look valid." : "That YouTube link doesn't include a video or playlist." };
  }
  const canonical = videoId
    ? `https://www.youtube.com/watch?v=${videoId}${listId ? `&list=${listId}` : ""}`
    : `https://www.youtube.com/playlist?list=${listId}`;
  return { kind: "youtube", videoId, listId, start, canonical };
}

export function parseMediaUrl(input: string): MediaSource {
  const url = toUrl(input);
  if (!url) return { kind: "error", message: "That doesn't look like a link. Paste a full YouTube or audio URL." };

  const yt = youtube(url);
  if (yt) return yt;

  if (url.protocol === "http:") {
    return { kind: "error", message: "For your security Ringlet only plays secure (https://) audio links." };
  }
  if (url.protocol !== "https:") {
    return { kind: "error", message: "Only https:// audio links and YouTube links are supported." };
  }
  if (url.username || url.password) {
    return { kind: "error", message: "Links containing a username or password aren't supported." };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const service = WEBPAGE_HOSTS[host];
  if (service) {
    return {
      kind: "error",
      message: `${service} links open a web page, not an audio stream, so they can't play here. Use a direct audio link (like .mp3) or YouTube.`,
    };
  }

  const file = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const ext = file.includes(".") ? file.split(".").pop()!.toLowerCase() : "";
  const likelyAudio = AUDIO_EXT.has(ext);
  const name = file && file.length < 120 ? file : url.hostname;
  return { kind: "audio", url: url.toString(), name, likelyAudio };
}

/** The URL stored for a saved link: canonical, plus the start offset if the pasted link had one. */
export function savedUrl(src: Exclude<MediaSource, { kind: "error" }>): string {
  if (src.kind === "audio") return src.url;
  return src.start > 0 ? `${src.canonical}&t=${src.start}` : src.canonical;
}

/** Placeholder name for a saved YouTube link until the user renames it (or it plays and reports a title). */
export const YOUTUBE_PLACEHOLDER = "YouTube video";

export function defaultItemName(src: Exclude<MediaSource, { kind: "error" }>): string {
  if (src.kind === "audio") return src.name;
  return src.videoId ? YOUTUBE_PLACEHOLDER : "YouTube playlist";
}

/** i.ytimg.com thumbnail for a saved single video (allowed by the CSP); playlists have none. */
export function thumbnailUrl(url: string): string | null {
  const src = parseMediaUrl(url);
  return src.kind === "youtube" && src.videoId ? `https://i.ytimg.com/vi/${src.videoId}/mqdefault.jpg` : null;
}

/** Human-readable explanation of YouTube IFrame API error codes. */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return "YouTube rejected the video or playlist ID.";
    case 5:
      return "This video can't be played in the embedded player on this system.";
    case 100:
      return "This video was removed or is private.";
    case 101:
    case 150:
      return "The owner of this video doesn't allow it to be played in other apps. Try another video, or open it on YouTube.";
    case 152:
    case 153:
      return "YouTube refused to load the embedded player (player configuration error).";
    default:
      return `YouTube couldn't play this (error ${code}).`;
  }
}

/** Describes HTMLMediaElement errors without guessing beyond what we know. */
export function audioErrorMessage(code: number | undefined, likelyAudio: boolean): string {
  switch (code) {
    case 1:
      return "Playback was stopped before the audio loaded.";
    case 2:
      return "A network error interrupted the audio. Check your connection and try again.";
    case 3:
      return "The audio file is damaged or uses an encoding this system can't decode.";
    case 4:
      return likelyAudio
        ? "This audio format or server isn't supported on this system."
        : "This link didn't return playable audio. It may be a web page rather than a direct audio file.";
    default:
      return "The audio couldn't be played.";
  }
}
