import { useEffect, useRef } from "react";
import { ArrowUpRight, Square } from "lucide-react";
import { motion } from "motion/react";
import { attachPlayerFrame, detachPlayerFrame, music, useMusic } from "@/stores/music";
import { useApp } from "@/stores/app";
import { useUi } from "@/stores/ui";

const DOCK_W = 356;
const DOCK_H = 200; // YouTube's minimum embed size is 200×200 incl. controls

/**
 * Hosts the YouTube iframe for the whole dashboard. The iframe is never
 * re-parented (that would reload it); it is positioned over the Music page's
 * player slot, or docked as a visible mini player on other pages. It is never
 * hidden, shrunk below YouTube's minimum size, or covered by Ringlet UI.
 */
export function YouTubeStage() {
  const source = useMusic((s) => s.source);
  const origin = useApp((s) => s.playerOrigin);
  const page = useUi((s) => s.page);
  const slot = useUi((s) => s.playerSlot);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const isYouTube = source?.kind === "youtube";
  useEffect(() => {
    if (!isYouTube) return;
    return () => detachPlayerFrame();
  }, [isYouTube]);

  if (!isYouTube || !origin) return null;

  const docked = page !== "music" || !slot;
  const style: React.CSSProperties = docked
    ? { right: 20, bottom: 20, width: DOCK_W, height: DOCK_H }
    : { left: slot.left, top: slot.top, width: slot.width, height: slot.height };

  return (
    <>
      {docked && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed z-40 flex items-center justify-between rounded-t-xl border border-b-0 border-line bg-elevated px-2.5 shadow-card"
          style={{ right: 20, bottom: 20 + DOCK_H, width: DOCK_W, height: 32 }}
        >
          <span className="truncate text-[12px] font-medium text-fg-2">Now playing</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => useUi.getState().setPage("music")}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-2 hover:bg-hover hover:text-fg"
            >
              Music <ArrowUpRight className="size-3" />
            </button>
            <button
              type="button"
              aria-label="Stop video"
              onClick={() => music.stop()}
              className="flex size-6 items-center justify-center rounded-md text-fg-2 hover:bg-hover hover:text-fg"
            >
              <Square className="size-3" fill="currentColor" />
            </button>
          </div>
        </motion.div>
      )}
      <div
        className={docked ? "fixed z-40 overflow-hidden rounded-b-xl border border-line bg-black shadow-card" : "fixed z-30 overflow-hidden rounded-xl bg-black"}
        style={style}
      >
        <iframe
          ref={frameRef}
          title="YouTube video player"
          src={`${origin}/player.html`}
          className="size-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => frameRef.current && attachPlayerFrame(frameRef.current)}
        />
      </div>
    </>
  );
}
