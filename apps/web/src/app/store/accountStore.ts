import { create } from 'zustand';
import {
  AccountError,
  deleteAccount,
  forgetSyncState,
  getSession,
  restoreWithRecoveryKey,
  signIn,
  signOut,
  signUp,
  syncNow,
  type AuthOutcome,
  type Session,
} from '../../lib/sync/account';
import { useUserStore } from './userStore';

/** Which account this device's data belongs to, so a different person can't absorb it. */
const OWNER_KEY = 'ramble.owner';
const readOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
};
const writeOwner = (id: string | null) => {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* storage blocked */
  }
};

type Status = 'unknown' | 'signed-out' | 'signed-in' | 'needs-recovery';

interface AccountState {
  status: Status;
  session: Session | null;
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  /** Shown once after creating the account vault; cleared when the user confirms they saved it. */
  recoveryKey: string | null;
  info: string | null;
  refresh: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  restore: (email: string, password: string, recovery: string) => Promise<void>;
  signOut: (removeLocalData: boolean) => Promise<void>;
  sync: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  ackRecoveryKey: () => void;
}

/** A device with someone else's data must be cleared before another account signs in. */
function mergeGuard(session: Session) {
  const owner = readOwner();
  const { places, visits, journal } = useUserStore.getState();
  if (owner && owner !== session.userId && places.length + visits.length + journal.length > 0) {
    throw new AccountError('This device has places from another account. Delete them from this device first (You → Delete all data), then sign in.');
  }
}

export const useAccountStore = create<AccountState>((set, get) => {
  async function afterAuth(outcome: AuthOutcome) {
    if (outcome.kind === 'verify-email') {
      set({ status: 'signed-out', info: 'Check your inbox to confirm your email, then sign in here.', error: null });
      return;
    }
    writeOwner(outcome.session.userId);
    if (outcome.kind === 'needs-recovery') {
      set({ status: 'needs-recovery', session: outcome.session, error: null });
      return;
    }
    set({ status: 'signed-in', session: outcome.session, recoveryKey: outcome.recoveryKey ?? null, error: null, info: null });
    await useUserStore.getState().reload();
    await get().sync();
  }

  const fail = (e: unknown) => set({ error: e instanceof AccountError ? e.message : 'Something went wrong. Try again.' });

  return {
    status: 'unknown',
    session: null,
    syncing: false,
    lastSync: null,
    error: null,
    recoveryKey: null,
    info: null,

    refresh: async () => {
      const session = await getSession();
      set({ session, status: session ? 'signed-in' : 'signed-out' });
      if (session) await get().sync();
    },

    signUp: async (email, password) => {
      set({ error: null, info: null });
      try {
        await afterAuth(await signUp(email, password, mergeGuard));
      } catch (e) {
        fail(e);
      }
    },

    signIn: async (email, password) => {
      set({ error: null, info: null });
      try {
        await afterAuth(await signIn(email, password, mergeGuard));
      } catch (e) {
        fail(e);
      }
    },

    restore: async (email, password, recovery) => {
      set({ error: null });
      try {
        await restoreWithRecoveryKey(email, password, recovery);
        set({ status: 'signed-in', error: null });
        await useUserStore.getState().reload();
        await get().sync();
      } catch (e) {
        fail(e);
      }
    },

    signOut: async (removeLocalData) => {
      const { session } = get();
      // Push what's pending first, but never let a bad connection trap the user.
      await Promise.race([get().sync(), new Promise((r) => setTimeout(r, 8000))]);
      await signOut();
      if (session) forgetSyncState(session.userId);
      if (removeLocalData) {
        await useUserStore.getState().wipe();
        writeOwner(null);
      }
      set({ status: 'signed-out', session: null, lastSync: null, error: null, recoveryKey: null });
    },

    sync: async () => {
      const { session, syncing, status } = get();
      if (!session || syncing || status !== 'signed-in' || !navigator.onLine) return;
      set({ syncing: true });
      try {
        const { pulled } = await syncNow(session.userId);
        if (pulled > 0) await useUserStore.getState().reload();
        set({ lastSync: Date.now(), error: null });
      } catch (e) {
        fail(e);
      } finally {
        set({ syncing: false });
      }
    },

    deleteAccount: async () => {
      const { session } = get();
      try {
        await deleteAccount();
        if (session) forgetSyncState(session.userId);
        writeOwner(null);
        set({ status: 'signed-out', session: null, lastSync: null, recoveryKey: null, info: 'Your account and everything synced to it were deleted. Your places are still on this device.' });
      } catch (e) {
        fail(e);
      }
    },

    ackRecoveryKey: () => set({ recoveryKey: null }),
  };
});

// Sync a few seconds after local changes, and when the connection comes back.
let timer: ReturnType<typeof setTimeout> | undefined;
const scheduleSync = () => {
  clearTimeout(timer);
  timer = setTimeout(() => void useAccountStore.getState().sync(), 5000);
};
useUserStore.subscribe((s, prev) => {
  if (s.places !== prev.places || s.visits !== prev.visits || s.journal !== prev.journal) scheduleSync();
});
if (typeof window !== 'undefined') window.addEventListener('online', scheduleSync);
