import { AudioLines, Pause, Play } from "lucide-react";
import type { NoiseKind } from "@/services/noise";
import { music, useMusic } from "@/stores/music";
import { useSettings } from "@/stores/app";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { cn } from "@/lib/utils";
import { VolumeControl } from "./VolumeControl";

const SOUNDS: { kind: NoiseKind; name: string; hint: string }[] = [
  { kind: "white", name: "White noise", hint: "Bright, even hiss" },
  { kind: "pink", name: "Pink noise", hint: "Softer, like steady rain" },
  { kind: "brown", name: "Brown noise", hint: "Deep, warm rumble" },
];

export function FocusSounds() {
  const noise = useMusic((s) => s.noise);
  const playing = useMusic((s) => s.noisePlaying);
  const settings = useSettings();
  const update = useUpdateSettings();
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">
          <AudioLines className="size-3.5" /> Your Focus Sounds
        </h3>
        <VolumeControl
          label="Focus sounds"
          value={settings.audio.focusSoundVolume}
          onChange={(v) => music.setNoiseVolume(v)}
          onCommit={(v) => void update({ audio: { focusSoundVolume: v } })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {SOUNDS.map((s) => {
          const active = noise === s.kind && playing;
          return (
            <button
              key={s.kind}
              type="button"
              onClick={() => void music.toggleNoise(s.kind)}
              aria-pressed={active}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150",
                active ? "border-accent/40 bg-accent/8 shadow-soft" : "border-line bg-surface shadow-soft hover:bg-hover",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  active ? "bg-accent text-accent-fg" : "bg-sunken text-fg-2 group-hover:text-fg",
                )}
              >
                {active ? <Pause className="size-3.5" fill="currentColor" strokeWidth={0} /> : <Play className="ml-px size-3.5" fill="currentColor" strokeWidth={0} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">{s.name}</span>
                <span className="block truncate text-[11.5px] text-fg-3">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[11.5px] text-fg-3">Generated on your device — works offline and mixes with music.</p>
    </section>
  );
}
