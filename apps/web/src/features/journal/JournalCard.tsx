import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { JournalEntry } from '@ramble/shared';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';

const when = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/** A journal entry: photo (decrypted on demand), title, text, tags. Tap to edit. */
export function JournalCard({ entry, showPlace = false }: { entry: JournalEntry; showPlace?: boolean }) {
  const getPhoto = useUserStore((s) => s.getPhoto);
  const placeName = useUserStore((s) => s.places.find((p) => p.id === entry.placeId)?.name);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!entry.photoId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void getPhoto(entry.photoId).then((blob) => {
      if (blob && !cancelled) setUrl((objectUrl = URL.createObjectURL(blob)));
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.photoId, getPhoto]);

  return (
    <button type="button" onClick={() => useUiStore.getState().openComposer({ entryId: entry.id })} className="flex w-full gap-3 rounded-2xl bg-white p-3 text-left">
      {url && <img src={url} alt="" className="size-16 shrink-0 rounded-xl object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/50">
          {when(entry.createdAt)}
          {showPlace && placeName && <span className="truncate">· {placeName}</span>}
          {entry.aiAssisted && <Sparkles size={11} className="text-moss" aria-label="Polished by Gemma" />}
        </p>
        {entry.title && <p className="truncate font-display text-[16px] font-semibold text-forest">{entry.title}</p>}
        <p className="line-clamp-2 text-sm text-ink/70">{entry.body}</p>
        {entry.tags.length > 0 && <p className="mt-1 truncate text-xs font-medium text-moss">{entry.tags.map((t) => `#${t}`).join(' ')}</p>}
      </div>
    </button>
  );
}
