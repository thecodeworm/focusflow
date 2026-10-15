import { useEffect, useState } from "react";
import { Check, FolderPlus, ListMusic, MonitorPlay, Music2, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import type { Collection, SavedItem } from "@/types";
import { defaultItemName, parseMediaUrl, savedUrl, thumbnailUrl, YOUTUBE_PLACEHOLDER } from "@/lib/media-url";
import { uid } from "@/lib/utils";
import { useSettings } from "@/stores/app";
import { music, useMusic } from "@/stores/music";
import { toast } from "@/stores/toast";
import { useUpdateSettings } from "@/hooks/useSettingsUpdate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const MAX_COLLECTIONS = 20;
const MAX_ITEMS = 200;

function Thumb({ item }: { item: SavedItem }) {
  const [failed, setFailed] = useState(false);
  const src = thumbnailUrl(item.url);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-9 w-16 shrink-0 rounded-md bg-sunken object-cover" />;
  }
  return (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-2">
      {item.source === "youtube" ? <MonitorPlay className="size-4" /> : <Music2 className="size-4" />}
    </span>
  );
}

function ItemRow({ item, onSave, onDelete }: { item: SavedItem; onSave: (i: SavedItem) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);

  const play = () => {
    const parsed = parseMediaUrl(item.url);
    if (parsed.kind === "error") toast.error(parsed.message);
    else music.load(parsed);
  };

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...item, name: name.trim() || item.name });
          setEditing(false);
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={120} className="h-7 flex-1" />
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
      <Thumb item={item} />
      <button type="button" onClick={play} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium text-fg">{item.name}</span>
        <span className="block truncate text-[11.5px] text-fg-3">{item.url.replace(/^https:\/\/(www\.)?/, "")}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Tooltip content="Rename">
          <Button size="icon-sm" variant="ghost" aria-label={`Rename ${item.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </Tooltip>
        <Tooltip content="Remove">
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </Tooltip>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={`Play ${item.name}`} onClick={play}>
        <Play fill="currentColor" strokeWidth={0} />
      </Button>
    </div>
  );
}

function AddLink({ collection, onAdd }: { collection: Collection; onAdd: (item: SavedItem) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseMediaUrl(value);
    if (parsed.kind === "error") return setError(parsed.message);
    const url = savedUrl(parsed);
    if (collection.items.some((i) => i.url === url)) return setError("That link is already in this collection.");
    if (collection.items.length >= MAX_ITEMS) return setError(`A collection holds up to ${MAX_ITEMS} links.`);
    onAdd({ id: uid("item"), name: defaultItemName(parsed), url, source: parsed.kind, label: null });
    setValue("");
    setError(null);
  };

  return (
    <form onSubmit={submit} className="px-3 py-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Paste a YouTube or audio link to add"
          aria-label={`Add a link to ${collection.name}`}
          aria-invalid={!!error}
          className="h-7"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!value.trim()}>
          <Plus /> Add
        </Button>
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function CollectionCard({ c, onChange, onDelete }: { c: Collection; onChange: (c: Collection) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(c.name);
  const setItems = (items: SavedItem[]) => onChange({ ...c, items });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...c, name: name.trim() || c.name });
              setEditing(false);
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Collection name" maxLength={40} className="h-7 flex-1" />
            <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save">
              <Check />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}>
              <X />
            </Button>
          </form>
        ) : (
          <>
            <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
              {c.name} <span className="font-normal text-fg-3">· {c.items.length}</span>
            </h4>
            {confirming ? (
              <>
                <span className="text-[12px] text-fg-2">Delete this collection?</span>
                <Button size="sm" variant="secondary" onClick={onDelete}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Tooltip content="Rename collection">
                  <Button size="icon-sm" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => (setName(c.name), setEditing(true))}>
                    <Pencil />
                  </Button>
                </Tooltip>
                <Tooltip content="Delete collection">
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => (c.items.length ? setConfirming(true) : onDelete())}>
                    <Trash2 />
                  </Button>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>
      <div className="divide-y divide-line">
        {c.items.map((item) => (
          <ItemRow key={item.id} item={item} onSave={(n) => setItems(c.items.map((x) => (x.id === n.id ? n : x)))} onDelete={() => setItems(c.items.filter((x) => x.id !== item.id))} />
        ))}
        <AddLink collection={c} onAdd={(item) => setItems([...c.items, item])} />
      </div>
    </div>
  );
}

export function Collections() {
  const collections = useSettings().audio.collections;
  const update = useUpdateSettings();
  const source = useMusic((s) => s.source);
  const title = useMusic((s) => s.title);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const save = (list: Collection[]) => void update({ audio: { collections: list } });

  // A link saved without a title gets the real one the first time it plays.
  useEffect(() => {
    if (!title || source?.kind !== "youtube" || !source.videoId || source.listId) return;
    const url = savedUrl(source);
    const stale = (i: SavedItem) => i.url === url && i.name === YOUTUBE_PLACEHOLDER;
    if (!collections.some((c) => c.items.some(stale))) return;
    save(collections.map((c) => ({ ...c, items: c.items.map((i) => (stale(i) ? { ...i, name: title.slice(0, 120) } : i)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, source]);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    save([...collections, { id: uid("col"), name: name.slice(0, 40), items: [] }]);
    setNewName("");
    setCreating(false);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-fg-2 uppercase">
          <ListMusic className="size-3.5" /> Collections
        </h3>
        {!creating && (
          <Button size="sm" variant="ghost" disabled={collections.length >= MAX_COLLECTIONS} onClick={() => setCreating(true)}>
            <FolderPlus /> New collection
          </Button>
        )}
      </div>
      {creating && (
        <form onSubmit={create} className="mb-3 flex items-center gap-2">
          <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Collection name, e.g. Deep work" aria-label="New collection name" maxLength={40} className="h-8" />
          <Button type="submit" size="sm" variant="primary" disabled={!newName.trim()}>
            Create
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => (setCreating(false), setNewName(""))}>
            Cancel
          </Button>
        </form>
      )}
      {collections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[12.5px] text-fg-3">
          Create a collection, paste YouTube links into it, then click any saved item to play it. The star next to the link field saves to Favorites.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {collections.map((c) => (
            <CollectionCard key={c.id} c={c} onChange={(n) => save(collections.map((x) => (x.id === n.id ? n : x)))} onDelete={() => save(collections.filter((x) => x.id !== c.id))} />
          ))}
        </div>
      )}
    </section>
  );
}
