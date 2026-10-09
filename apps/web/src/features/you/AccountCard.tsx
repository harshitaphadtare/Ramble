import { useEffect, useState } from 'react';
import { CloudUpload, Copy, KeyRound, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Trash } from 'lucide-react';
import { useAccountStore } from '../../app/store/accountStore';
import { useFeatures } from '../../app/store/featuresStore';
import { MIN_PASSWORD_LENGTH } from '../../lib/crypto/account';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

const input = 'w-full rounded-xl bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-moss focus:outline-none';

/** Optional account: end-to-end-encrypted backup and sync. Shown only when the server has it on. */
export function AccountCard() {
  const enabled = useFeatures((s) => s.accounts);
  const a = useAccountStore();

  useEffect(() => {
    if (enabled && a.status === 'unknown') void a.refresh();
  }, [enabled, a]);

  if (!enabled) return null;
  if (a.recoveryKey) return <RecoveryKeyStep text={a.recoveryKey} onDone={a.ackRecoveryKey} />;
  if (a.status === 'needs-recovery') return <RestoreStep />;
  if (a.status === 'signed-in' && a.session) return <SignedIn />;
  return <SignInForm />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 rounded-2xl bg-white p-4">{children}</div>;
}

function Message() {
  const { error, info } = useAccountStore();
  if (error) return <p role="alert" className="mt-2 rounded-xl bg-ember/10 px-3 py-2 text-xs font-medium text-ember">{error}</p>;
  if (info) return <p className="mt-2 rounded-xl bg-forest/5 px-3 py-2 text-xs font-medium text-forest">{info}</p>;
  return null;
}

function SignInForm() {
  const { signIn, signUp } = useAccountStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>('sign-up');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Shell>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
          <CloudUpload size={16} aria-hidden="true" /> Back up & sync (optional)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink/60">Keep your map safe and use it on your laptop too. End-to-end encrypted: our server only ever stores scrambled data.</p>
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white">
          Set it up
        </button>
        <Message />
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          const email = String(data.get('email') ?? '').trim();
          const password = String(data.get('password') ?? '');
          await (mode === 'sign-up' ? signUp(email, password) : signIn(email, password));
          setBusy(false);
        }}
      >
        <p className="mb-2 text-sm font-semibold text-forest">{mode === 'sign-up' ? 'Create your account' : 'Sign in'}</p>
        <input name="email" type="email" required autoComplete="email" placeholder="Email" className={`${input} mb-2`} />
        <input
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          placeholder={`Password (${MIN_PASSWORD_LENGTH}+ characters)`}
          className={input}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink/50">Your password never leaves this phone. It unlocks your encryption key here, so we can't read your data, and can't recover it without your recovery key.</p>
        <button type="submit" disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
          {busy ? 'Securing your keys…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')} className="mt-2 text-xs font-semibold text-moss">
        {mode === 'sign-up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
      <Message />
    </Shell>
  );
}

function RecoveryKeyStep({ text, onDone }: { text: string; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);
  const lastGroup = text.slice(-4);
  return (
    <Shell>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
        <KeyRound size={16} aria-hidden="true" /> Save your recovery key
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink/60">If you forget your password, this is the only way back into your data. We can't reset it for you. Store it somewhere safe, like a password manager.</p>
      <p className="mt-3 rounded-xl bg-mist px-3 py-2 font-mono text-[13px] leading-relaxed break-all text-forest select-all">{text}</p>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-moss"
      >
        <Copy size={13} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
      </button>
      <label className="mt-3 block text-xs font-semibold text-ink/70">
        To confirm you saved it, type its last 4 characters
        <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} maxLength={4} className={`${input} mt-1 font-mono`} />
      </label>
      <button type="button" disabled={typed !== lastGroup} onClick={onDone} className="mt-3 w-full rounded-xl bg-forest py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        I've saved it
      </button>
    </Shell>
  );
}

function RestoreStep() {
  const { session, restore } = useAccountStore();
  const [busy, setBusy] = useState(false);
  return (
    <Shell>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          await restore(session!.email, String(data.get('password') ?? ''), String(data.get('recovery') ?? ''));
          setBusy(false);
        }}
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
          <KeyRound size={16} aria-hidden="true" /> Unlock with your recovery key
        </p>
        <p className="mt-1 mb-2 text-xs text-ink/60">Your password changed, so your data needs your recovery key once. Then your current password works again.</p>
        <input name="recovery" required placeholder="RMBL-…" className={`${input} mb-2 font-mono`} />
        <input name="password" type="password" required placeholder="Your current password" className={input} />
        <button type="submit" disabled={busy} className="mt-3 w-full rounded-xl bg-forest py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
      <Message />
    </Shell>
  );
}

function SignedIn() {
  const { session, syncing, lastSync, sync, signOut, deleteAccount } = useAccountStore();
  const [confirm, setConfirm] = useState<'sign-out' | 'delete' | null>(null);
  const [removeLocal, setRemoveLocal] = useState(false);
  return (
    <Shell>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
        <ShieldCheck size={16} aria-hidden="true" /> Encrypted sync is on
      </p>
      <p className="mt-1 truncate text-xs text-ink/60">{session!.email}</p>
      <p className="text-xs text-ink/50">{syncing ? 'Syncing…' : lastSync ? `Synced ${ago(lastSync)}` : 'Not synced yet'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void sync()} disabled={syncing} className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-xs font-semibold text-forest disabled:opacity-60">
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} aria-hidden="true" /> Sync now
        </button>
        <button type="button" onClick={() => setConfirm('sign-out')} className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-xs font-semibold text-forest">
          <LogOut size={13} aria-hidden="true" /> Sign out
        </button>
        <button type="button" onClick={() => setConfirm('delete')} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-ember">
          <Trash size={13} aria-hidden="true" /> Delete account
        </button>
      </div>
      {confirm === 'sign-out' && (
        <div className="mt-3 rounded-xl bg-mist p-3 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={removeLocal} onChange={(e) => setRemoveLocal(e.target.checked)} className="size-4 accent-forest" />
            Also remove my places from this device (shared phone)
          </label>
          <button type="button" onClick={() => void signOut(removeLocal)} className="mt-2 rounded-lg bg-forest px-3 py-1.5 font-semibold text-white">
            Sign out
          </button>
        </div>
      )}
      {confirm === 'delete' && (
        <div className="mt-3 rounded-xl bg-ember/10 p-3 text-xs text-ember">
          This deletes your account and everything synced to it. Your places stay on this device.
          <button type="button" onClick={() => void deleteAccount()} className="mt-2 block rounded-lg bg-ember px-3 py-1.5 font-semibold text-white">
            Yes, delete my account
          </button>
        </div>
      )}
      <Message />
    </Shell>
  );
}
