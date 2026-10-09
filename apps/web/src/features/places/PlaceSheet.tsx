import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Bookmark, BookmarkCheck, MapPinCheck, Navigation, PenLine, Pencil, Trash } from 'lucide-react';
import { levelFor } from '@ramble/shared';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore, visitsFor } from '../../app/store/userStore';
import { useWalkStore } from '../../app/store/walkStore';
import { LevelBadge, LevelRing } from '../../ui/Level';
import { KIND_STYLE, gradient } from '../../ui/visuals';
import { Sheet, Title } from '../../ui/Sheet';
import { JournalCard } from '../journal/JournalCard';

const shortDate = (t: number) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

/** One of your places: level, visits, memories, and what you can do with it. */
export function PlaceSheet() {
  const id = useUiStore((s) => s.openPlaceId);
  return <AnimatePresence>{id && <Details key={id} id={id} />}</AnimatePresence>;
}

function Details({ id }: { id: string }) {
  const { places, visits, journal, checkIn, toggleWantToGo, renamePlace, removePlace } = useUserStore();
  const { openPlace, openComposer, showToast } = useUiStore();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const place = places.find((p) => p.id === id);
  if (!place) return null;

  const count = visitsFor(visits, id);
  const level = levelFor(count);
  const kind = KIND_STYLE[place.kind];
  const KindIcon = kind.icon;
  const lastVisit = visits.filter((v) => v.placeId === id).sort((a, b) => b.at - a.at)[0];
  const memories = journal.filter((j) => j.placeId === id).sort((a, b) => b.createdAt - a.createdAt);

  async function doCheckIn() {
    const visit = await checkIn(id);
    showToast(`Checked in at ${place!.name}`);
    openComposer({ placeId: id, visitId: visit.id });
  }

  return (
    <Sheet label={place.name} onClose={() => openPlace(null)} layer="z-20">
      <div className="mb-3 flex items-start gap-3 pr-8">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: gradient(kind.from, kind.to) }}>
          <KindIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get('name');
                void renamePlace(id, String(name ?? '')).then(() => setEditing(false));
              }}
            >
              <input name="name" defaultValue={place.name} maxLength={80} autoFocus className="w-full rounded-lg bg-white px-2 py-1 font-display text-xl font-semibold text-forest focus:ring-2 focus:ring-moss focus:outline-none" />
            </form>
          ) : (
            <Title className="truncate">{place.name}</Title>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink/55">
            <LevelBadge visits={count} /> {kind.label}
            {lastVisit && <span>· last here {shortDate(lastVisit.at)}</span>}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-3">
        <LevelRing visits={count} />
        <div className="text-sm">
          <p className="font-semibold text-ink">
            {level.label} · {count} {count === 1 ? 'visit' : 'visits'}
          </p>
          <p className="text-ink/60">{level.next ? `${level.next.visitsToGo} more to become ${level.next.label}` : 'Top level. This place is yours.'}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-[1fr_auto_auto_auto] gap-2">
        <button type="button" onClick={() => void doCheckIn()} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-forest to-moss py-3 font-bold text-white shadow-float">
          <MapPinCheck size={18} aria-hidden="true" /> I'm here
        </button>
        <button
          type="button"
          onClick={() => void toggleWantToGo(id)}
          aria-pressed={place.wantToGo}
          aria-label={place.wantToGo ? 'Remove from Want to go' : 'Add to Want to go'}
          className={`grid size-12 place-items-center rounded-2xl ${place.wantToGo ? 'bg-sunset text-white' : 'bg-mist text-forest'}`}
        >
          {place.wantToGo ? <BookmarkCheck size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => {
            void useWalkStore.getState().start({ name: place.name, kind: place.kind, lonLat: place.lonLat, placeId: place.id, sourceId: place.sourceId });
            openPlace(null);
          }}
          aria-label={`Walk to ${place.name}`}
          className="grid size-12 place-items-center rounded-2xl bg-mist text-forest"
        >
          <Navigation size={19} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => openComposer({ placeId: id })} aria-label="Write a memory" className="grid size-12 place-items-center rounded-2xl bg-mist text-forest">
          <PenLine size={19} aria-hidden="true" />
        </button>
      </div>

      {memories.length > 0 && (
        <>
          <p className="mb-2 text-sm font-semibold text-ink/70">Memories</p>
          <div className="mb-4 space-y-2">
            {memories.map((j) => (
              <JournalCard key={j.id} entry={j} />
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2 border-t border-ink/10 pt-3">
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink/60">
          <Pencil size={14} aria-hidden="true" /> Rename
        </button>
        {confirmRemove ? (
          <button
            type="button"
            onClick={() => {
              void removePlace(id).then(() => {
                openPlace(null);
                showToast('Place removed');
              });
            }}
            className="flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-sm font-semibold text-white"
          >
            <Trash size={14} aria-hidden="true" /> Remove with {count} {count === 1 ? 'visit' : 'visits'} and {memories.length} {memories.length === 1 ? 'memory' : 'memories'}?
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ember">
            <Trash size={14} aria-hidden="true" /> Remove
          </button>
        )}
      </div>
    </Sheet>
  );
}
