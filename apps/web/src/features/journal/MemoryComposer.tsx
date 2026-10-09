import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ImagePlus, LoaderCircle, Sparkles, Trash, X } from 'lucide-react';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { polishNote } from '../../lib/ai/polish';
import { PhotoError, preparePhoto } from '../../lib/media/photo';
import { Eyebrow, PrimaryButton, Sheet, Title } from '../../ui/Sheet';

const POLISH_EXPLAINED_KEY = 'ramble.polishExplained';

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: we'll just explain again next time */
  }
}

/** Write (or dictate) a note, add a photo, optionally ✨ Polish it, then save, encrypted. */
export function MemoryComposer() {
  const target = useUiStore((s) => s.composer);
  // Let a level-up celebration play first; the composer slides in once it's done.
  const celebrating = useUserStore((s) => s.celebration !== null);
  return <AnimatePresence>{target && !celebrating && <Composer key={`${target.placeId}-${target.visitId}-${target.entryId}`} />}</AnimatePresence>;
}

function Composer() {
  const target = useUiStore((s) => s.composer)!;
  const close = () => useUiStore.getState().openComposer(null);
  const { places, journal, saveJournal, putPhoto, getPhoto } = useUserStore();
  const existing = journal.find((j) => j.id === target.entryId);
  const place = places.find((p) => p.id === (existing?.placeId ?? target.placeId));

  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [aiAssisted, setAiAssisted] = useState(existing?.aiAssisted ?? false);
  const [photo, setPhoto] = useState<{ bytes: Uint8Array<ArrayBuffer>; mime: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [busy, setBusy] = useState<'polish' | 'save' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [explainPolish, setExplainPolish] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Show the existing photo (decrypted on the fly), and free object URLs when done.
  useEffect(() => {
    let url: string | null = null;
    if (existing?.photoId && !photo && !removeExistingPhoto) {
      void getPhoto(existing.photoId).then((blob) => {
        if (blob) setPhotoUrl((url = URL.createObjectURL(blob)));
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [existing?.photoId, photo, removeExistingPhoto, getPhoto]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(new Blob([prepared.bytes], { type: prepared.mime })));
    } catch (e) {
      setMessage(e instanceof PhotoError ? e.message : "Couldn't add that photo.");
    }
  }

  async function polish() {
    if (!safeGet(POLISH_EXPLAINED_KEY)) {
      setExplainPolish(true);
      return;
    }
    setBusy('polish');
    setMessage(null);
    const result = await polishNote({ note: body, placeName: place?.name, kind: place?.kind });
    setBusy(null);
    if (result.source !== 'gemma') {
      setMessage(navigator.onLine ? "Gemma couldn't polish this one right now. Your note is unchanged." : "You're offline. Polish works once you're back online.");
      return;
    }
    setTitle(result.title);
    setBody(result.body);
    setTags(result.tags);
    setAiAssisted(true);
  }

  async function save() {
    if (!body.trim() && !photo) return;
    setBusy('save');
    try {
      let photoId = removeExistingPhoto ? undefined : existing?.photoId;
      if (photo) photoId = await putPhoto(photo.bytes, photo.mime);
      await saveJournal({
        id: existing?.id,
        placeId: place?.id,
        visitId: existing?.visitId ?? target.visitId,
        title: title.trim().slice(0, 80),
        body: body.trim().slice(0, 4000),
        tags,
        photoId,
        aiAssisted,
      });
      useUiStore.getState().showToast('Saved to your journal');
      close();
    } catch {
      setMessage("Couldn't save. Please try again.");
      setBusy(null);
    }
  }

  return (
    <Sheet label="New memory" onClose={close} layer="z-30">
      <Eyebrow>{place ? place.name : 'Journal'}</Eyebrow>
      <Title className="mb-3">{existing ? 'Edit memory' : 'Make it a memory'}</Title>

      {photoUrl ? (
        <div className="relative mb-3 overflow-hidden rounded-2xl">
          <img src={photoUrl} alt="Your photo" className="max-h-56 w-full object-cover" />
          <button
            type="button"
            onClick={() => {
              setPhoto(null);
              setPhotoUrl(null);
              setRemoveExistingPhoto(true);
            }}
            aria-label="Remove photo"
            className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-ink/70 text-white"
          >
            <Trash size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 py-5 text-sm font-semibold text-ink/60">
          <ImagePlus size={18} aria-hidden="true" /> Add a photo
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="Title (optional)"
        className="mb-2 w-full rounded-xl bg-white px-3 py-2.5 font-display text-lg font-semibold text-forest placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-ink/40 focus:ring-2 focus:ring-moss focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        rows={4}
        placeholder="What did you notice? Tap the mic on your keyboard to dictate."
        className="w-full resize-none rounded-xl bg-white px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-ink/40 focus:ring-2 focus:ring-moss focus:outline-none"
      />

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="flex items-center gap-1 rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-forest" aria-label={`Remove tag ${t}`}>
              #{t} <X size={11} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {explainPolish && (
        <div role="dialog" aria-label="About Polish" className="mt-3 rounded-2xl bg-forest/5 p-3 text-sm text-ink/75">
          <p className="font-semibold text-forest">✨ Polish sends this note to Gemma</p>
          <p className="mt-1">
            Only this note and the place name go, through our server, to Gemma on Cloudflare, which doesn't store it or train on it. Your other entries stay on this phone. You'll review the result before saving.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                safeSet(POLISH_EXPLAINED_KEY, '1');
                setExplainPolish(false);
                void polish();
              }}
              className="rounded-xl bg-forest px-3 py-2 text-sm font-semibold text-white"
            >
              Polish it
            </button>
            <button type="button" onClick={() => setExplainPolish(false)} className="rounded-xl bg-mist px-3 py-2 text-sm font-semibold text-forest">
              Not now
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="alert" className="mt-3 rounded-xl bg-ember/10 px-3 py-2 text-sm font-medium text-ember">
          {message}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void polish()}
          disabled={busy !== null || body.trim().length < 3}
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-mist px-4 font-semibold text-forest disabled:opacity-40"
        >
          {busy === 'polish' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
          Polish
        </button>
        <PrimaryButton onClick={() => void save()} disabled={busy !== null || (!body.trim() && !photo && !photoUrl)}>
          {busy === 'save' ? 'Saving…' : 'Save memory'}
        </PrimaryButton>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink/45">Encrypted on this phone. Photos are stripped of hidden location data.</p>
    </Sheet>
  );
}
