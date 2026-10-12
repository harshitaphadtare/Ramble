import { useRef, useState } from 'react';
import { Download, LoaderCircle, Upload } from 'lucide-react';
import { useUiStore } from '../../app/store/uiStore';
import { useUserStore } from '../../app/store/userStore';
import { createBackup, MIN_PASSPHRASE, openBackup } from '../../lib/backup';

/** Encrypted backup file: download one, or restore from one. */
export function BackupCard() {
  const [mode, setMode] = useState<'idle' | 'save' | 'restore'>('idle');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileText = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { places, visits, journal } = useUserStore.getState();
      const blob = await createBackup({ place: places, visit: visits, journal }, pass);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ramble-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      useUiStore.getState().showToast('Backup saved. Keep the passphrase somewhere safe.');
      setMode('idle');
      setPass('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the backup.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!fileText.current) return;
    setBusy(true);
    setError(null);
    try {
      const data = await openBackup(fileText.current, pass);
      const n = await useUserStore.getState().restore(data);
      useUiStore.getState().showToast(`Restored ${n} item${n === 1 ? '' : 's'} from your backup`);
      setMode('idle');
      setPass('');
      fileText.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-ink/5 pt-2">
      <p className="font-semibold text-forest">Backup file</p>
      <p>Your places, visits and notes in one encrypted file (photos not included).</p>
      {mode === 'idle' ? (
        <div className="mt-1.5 flex gap-2">
          <button type="button" onClick={() => setMode('save')} className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-1.5 font-semibold text-forest">
            <Download size={13} aria-hidden="true" /> Download backup
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-1.5 font-semibold text-forest">
            <Upload size={13} aria-hidden="true" /> Restore
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 40_000_000) return setError('That file is too big to be a Ramble backup.');
              fileText.current = await f.text();
              setError(null);
              setMode('restore');
            }}
          />
        </div>
      ) : (
        <form
          className="mt-1.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void (mode === 'save' ? save() : restore());
          }}
        >
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete={mode === 'save' ? 'new-password' : 'current-password'}
            placeholder={mode === 'save' ? `New passphrase (${MIN_PASSPHRASE}+ characters)` : 'Backup passphrase'}
            aria-label="Backup passphrase"
            className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-ink focus:border-forest focus:outline-none"
          />
          <button type="submit" disabled={busy || pass.length < (mode === 'save' ? MIN_PASSPHRASE : 1)} className="flex items-center gap-1.5 rounded-xl bg-forest px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            {busy && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
            {mode === 'save' ? 'Encrypt & download' : 'Restore'}
          </button>
          <button type="button" onClick={() => {
              setMode('idle');
              setPass('');
              setError(null);
            }} className="font-semibold text-ink/50">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-1 font-semibold text-ember">{error}</p>}
    </div>
  );
}
