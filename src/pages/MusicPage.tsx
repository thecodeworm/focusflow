import { useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Link2, Loader2, Music2, Pause, Play, Repeat, SkipBack, SkipForward, Square, Star } from "lucide-react";
import { api, errorMessage } from "@/lib/ipc";
import { defaultItemName, parseMediaUrl, savedUrl } from "@/lib/media-url";
import { uid, cn } from "@/lib/utils";
import { useSettings } from "@/stores/app";
import { music, useMusic } from "@/stores/music";
import { useUi } from "@/stores/ui";
import { toast } from "@/stores/toast";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { FocusSounds } from "@/components/music/FocusSounds";
import { Collections } from "@/components/music/Collections";
import { SeekBar } from "@/components/music/SeekBar";
import { VolumeControl } from "@/components/music/VolumeControl";

function UrlBar() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const settings = useSettings();
  const update = useUpdateSettings();
  const source = useMusic((s) => s.source);
  const title = useMusic((s) => s.title);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = music.open(value);
    setError(err);
  };

  // Star saves the link in the field (or the one playing) to the "Favorites" collection.
  const candidate = value.trim() ? parseMediaUrl(value) : source;
  const candidateUrl = candidate && candidate.kind !== "error" ? savedUrl(candidate) : null;
  const collections = settings.audio.collections;
  const favs = collections.find((c) => c.name === "Favorites");
  const saved = candidateUrl != null && !!favs?.items.some((i) => i.url === candidateUrl);

  const star = () => {
    if (!candidate || candidate.kind === "error" || !candidateUrl) {
      setError(candidate && candidate.kind === "error" ? candidate.message : "Paste a link to save it.");
      return;
    }
    if (saved && favs) {
      void update({ audio: { collections: collections.map((c) => (c === favs ? { ...c, items: c.items.filter((i) => i.url !== candidateUrl) } : c)) } });
      return;
    }
    if ((favs?.items.length ?? 0) >= 200) {
      setError("Favorites is full. Remove a link or use another collection.");
      return;
    }
    const isPlaying = source && (source.kind === "youtube" ? source.canonical : source.url) === (candidate.kind === "youtube" ? candidate.canonical : candidate.url);
    const name = (isPlaying && title) || defaultItemName(candidate);
    const item = { id: uid("item"), name, url: candidateUrl, source: candidate.kind, label: null };
    const next = favs
      ? collections.map((c) => (c === favs ? { ...c, items: [...c.items, item] } : c))
      : [{ id: "favorites", name: "Favorites", items: [item] }, ...collections];
    void update({ audio: { collections: next } }).then((s) => s && toast.success("Saved to Favorites."));
  };

  return (
    <div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="Paste a YouTube link or a direct audio URL (https://…/track.mp3)"
            aria-label="Music link"
            aria-invalid={!!error}
            className="h-9 pl-8"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="h-9" disabled={!value.trim()}>
          <Play fill="currentColor" strokeWidth={0} /> Play
        </Button>
        <Tooltip content={saved ? "Remove from Favorites" : "Save to Favorites"}>
          <Button variant="secondary" size="icon" className="size-9" aria-label={saved ? "Remove from Favorites" : "Save to Favorites"} onClick={star}>
            <Star className={cn(saved && "fill-accent text-accent")} />
          </Button>
        </Tooltip>
      </form>
      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 px-1 text-[12px] text-danger" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

/** Reserves space for the YouTube player and reports its position. */
function PlayerSlot({ height }: { height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      useUi.getState().setPlayerSlot({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
    };
    measure();
    // Observe the container too: content above the slot (e.g. an error
    // message) moves the slot without resizing it.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      useUi.getState().setPlayerSlot(null);
    };
  }, []);
  return <div ref={ref} className="mx-auto rounded-xl bg-black" style={{ height, aspectRatio: "16 / 9", maxWidth: "100%" }} aria-hidden="true" />;
}

/** Replaces the seek bar for live streams, which have no timeline. */
function LiveIndicator({ ended }: { ended: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 text-[12px] text-fg-2" role="status">
      <span className={cn("rounded px-1.5 py-px text-[10.5px] font-semibold tracking-wide", ended ? "bg-sunken text-fg-3" : "bg-danger/12 text-danger")}>
        {ended ? "ENDED" : "LIVE"}
      </span>
      <span className="text-fg-3">{ended ? "This live stream has ended." : "Live stream \u2014 there's no timeline to seek."}</span>
    </div>
  );
}

function StatusLine() {
  const phase = useMusic((s) => s.phase);
  const error = useMusic((s) => s.error);
  const source = useMusic((s) => s.source);
  if (phase === "error" && error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-danger/8 px-3 py-2 text-[12.5px] text-danger" role="alert">
        <AlertCircle className="mt-px size-4 shrink-0" />
        <span className="flex-1">{error}</span>
        {source?.kind === "youtube" && (
          <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={() => void api.openExternal(source.canonical).catch((e) => toast.error(errorMessage(e)))}>
            Open on YouTube
          </button>
        )}
      </div>
    );
  }
  if (phase === "blocked") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-[12.5px] text-fg">
        <Play className="size-3.5 text-accent" fill="currentColor" strokeWidth={0} />
        {source?.kind === "youtube" ? "Autoplay was blocked by the system — press play on the video to start." : "Autoplay was blocked — press Play to start."}
      </div>
    );
  }
  return null;
}

function Transport() {
  const m = useMusic();
  const settings = useSettings();
  const update = useUpdateSettings();
  if (!m.source) return null;
  const playing = m.phase === "playing" || m.phase === "buffering";
  const loading = m.phase === "loading" || m.phase === "buffering";
  const isPlaylist = m.source.kind === "youtube" && m.playlistLength > 1;
  const loop = settings.audio.loopMusic;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {isPlaylist && (
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={music.previous}>
            <SkipBack />
          </Button>
        )}
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => music.toggle()}
          className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-soft transition-transform hover:bg-accent-hover active:scale-95"
        >
          {loading && !playing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : playing ? (
            <Pause className="size-4" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-0.5 size-4" fill="currentColor" strokeWidth={0} />
          )}
        </button>
        {isPlaylist && (
          <Button variant="ghost" size="icon" aria-label="Next" onClick={music.next}>
            <SkipForward />
          </Button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-fg">{m.title || (m.source.kind === "youtube" ? "Loading from YouTube…" : "Audio stream")}</p>
        <p className="truncate text-[12px] text-fg-3">
          {m.source.kind === "youtube"
            ? [m.author, isPlaylist ? `Track ${m.playlistIndex + 1} of ${m.playlistLength}` : null].filter(Boolean).join(" · ") || "YouTube"
            : m.source.likelyAudio
              ? "Direct audio"
              : "Direct audio (unverified link)"}
        </p>
      </div>
      <VolumeControl
        label="Music"
        value={settings.audio.musicVolume}
        muted={m.muted}
        onToggleMute={() => music.setMuted(!m.muted)}
        onChange={(v) => music.setVolume(v)}
        onCommit={(v) => void update({ audio: { musicVolume: v } })}
      />
      <Tooltip content={loop ? "Loop on" : "Loop off"}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Loop"
          aria-pressed={loop}
          className={cn(loop && "text-accent hover:text-accent")}
          onClick={() => {
            music.setLoop(!loop);
            void update({ audio: { loopMusic: !loop } });
          }}
        >
          <Repeat />
        </Button>
      </Tooltip>
      {m.source.kind === "youtube" && (
        <Tooltip content="Open on YouTube">
          <Button variant="ghost" size="icon" aria-label="Open on YouTube" onClick={() => void api.openExternal((m.source as { canonical: string }).canonical)}>
            <ExternalLink />
          </Button>
        </Tooltip>
      )}
      <Tooltip content="Stop">
        <Button variant="ghost" size="icon" aria-label="Stop" onClick={() => music.stop()}>
          <Square className="size-3.5" fill="currentColor" />
        </Button>
      </Tooltip>
    </div>
  );
}

function AudioStage({ height }: { height: number }) {
  const m = useMusic();
  return (
    <div
      className="mx-auto flex flex-col items-center justify-center gap-5 rounded-xl border border-line bg-gradient-to-b from-surface to-sunken px-8 dark:to-black/20"
      style={{ height, aspectRatio: "16 / 9", maxWidth: "100%" }}
    >
      <div className={cn("flex size-16 items-center justify-center rounded-2xl bg-accent/12 text-accent", m.phase === "playing" && "bg-accent text-accent-fg")}>
        <Music2 className="size-7" />
      </div>
      <p className="max-w-full truncate text-[15px] font-semibold text-fg">{m.title}</p>
      {m.seekable ? (
        <SeekBar position={m.position} duration={m.duration} onSeek={(s) => music.seek(s)} />
      ) : (
        <p className="text-[12px] text-fg-3">{m.phase === "playing" ? "Live stream" : m.phase === "loading" ? "Connecting…" : ""}</p>
      )}
    </div>
  );
}

function EmptyStage({ height }: { height: number }) {
  return (
    <div
      className="mx-auto flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-8 text-center"
      style={{ height, aspectRatio: "16 / 9", maxWidth: "100%" }}
    >
      <Music2 className="size-6 text-fg-3" />
      <p className="text-[13.5px] font-medium text-fg">Nothing playing</p>
      <p className="max-w-[340px] text-[12.5px] leading-relaxed text-fg-2">
        Paste a YouTube video, live stream or playlist link, or a direct audio URL. YouTube plays in a visible embedded player right here.
      </p>
    </div>
  );
}

export function MusicPage() {
  const source = useMusic((s) => s.source);
  const ytSeek = useMusic((s) => s.source?.kind === "youtube" && s.seekable);
  const live = useMusic((s) => s.source?.kind === "youtube" && s.live);
  const ended = useMusic((s) => s.phase === "paused" && s.live);
  const position = useMusic((s) => s.position);
  const duration = useMusic((s) => s.duration);
  // 16:9 stage: at least YouTube's recommended 480×270, larger on tall windows.
  const [height, setHeight] = useState(() => stageHeight());
  useLayoutEffect(() => {
    const onResize = () => setHeight(stageHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Music" subtitle="Focus music without leaving Ringlet" />
      <div className="flex shrink-0 flex-col gap-3 px-8">
        <UrlBar />
        {source?.kind === "youtube" ? <PlayerSlot height={height} /> : source?.kind === "audio" ? <AudioStage height={height} /> : <EmptyStage height={height} />}
        {live && <LiveIndicator ended={ended} />}
        {ytSeek && <SeekBar position={position} duration={duration} onSeek={(s) => music.seek(s)} />}
        <Transport />
        <StatusLine />
      </div>
      <div className="page-scroll scroll-area mt-4 flex min-h-0 flex-1 flex-col gap-6 border-t border-line px-8 pt-5 pb-8">
        <FocusSounds />
        <Collections />
        <p className="text-[11.5px] leading-relaxed text-fg-3">
          YouTube videos play through YouTube's official embedded player and follow YouTube's rules: the player stays visible while in use, ads and
          restrictions are YouTube's, and some videos can't be embedded. Ringlet never downloads or extracts audio.
        </p>
      </div>
    </div>
  );
}

function stageHeight() {
  return Math.round(Math.min(400, Math.max(270, window.innerHeight * 0.4)));
}
