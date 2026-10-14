import { useState } from "react";
import { Check, MonitorPlay, Music2, Pencil, Play, Star, Trash2, X } from "lucide-react";
import type { Favorite } from "@/types";
import { parseMediaUrl } from "@/lib/media-url";
import { useSettings } from "@/stores/app";
import { music } from "@/stores/music";
import { toast } from "@/stores/toast";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

function FavoriteRow({ f, onSave, onDelete }: { f: Favorite; onSave: (f: Favorite) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [label, setLabel] = useState(f.label ?? "");

  const play = () => {
    const parsed = parseMediaUrl(f.url);
    if (parsed.kind === "error") toast.error(parsed.message);
    else music.load(parsed);
  };

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...f, name: name.trim() || f.name, label: label.trim() || null });
          setEditing(false);
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={120} className="h-7 flex-1" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" placeholder="Label" maxLength={40} className="h-7 w-28" />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save">
          <Check />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-2">
        {f.source === "youtube" ? <MonitorPlay className="size-3.5" /> : <Music2 className="size-3.5" />}
      </span>
      <button type="button" onClick={play} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg">{f.name}</span>
          {f.label && <span className="shrink-0 rounded-full bg-sunken px-1.5 py-px text-[10.5px] font-medium text-fg-2">{f.label}</span>}
        </span>
        <span className="block truncate text-[11.5px] text-fg-3">{f.url.replace(/^https:\/\/(www\.)?/, "")}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Tooltip content="Rename">
          <Button size="icon-sm" variant="ghost" aria-label={`Rename ${f.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </Tooltip>
        <Tooltip content="Remove">
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </Tooltip>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={`Play ${f.name}`} onClick={play}>
        <Play fill="currentColor" strokeWidth={0} />
      </Button>
    </div>
  );
}

export function Favorites() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const favs = settings.audio.favorites;
  const save = (list: Favorite[]) => void update({ audio: { favorites: list } });

  return (
    <section>
      <div className="mb-2 flex items-center px-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">
          <Star className="size-3.5" /> Favorites
        </h3>
      </div>
      {favs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[12.5px] text-fg-3">
          Save links you return to with the star next to the link field.
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
          {favs.map((f) => (
            <FavoriteRow
              key={f.id}
              f={f}
              onSave={(n) => save(favs.map((x) => (x.id === n.id ? n : x)))}
              onDelete={() => save(favs.filter((x) => x.id !== f.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
