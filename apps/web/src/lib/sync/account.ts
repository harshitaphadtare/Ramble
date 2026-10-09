import { KDF_V1, syncPullResponseSchema, vaultSchema, type VaultBlob } from '@ramble/shared';
import { createRecoveryKey, deriveAccountKeys, MIN_PASSWORD_LENGTH, parseRecoveryKey, type AccountKeys } from '../crypto/account';
import { vault } from '../db/instance';
import { fromBase64, toBase64 } from '../encoding';

/**
 * Accounts and end-to-end-encrypted sync, from the device's side (docs/ARCHITECTURE.md §10).
 * Plaintext never leaves this module: we send the derived auth key, wrapped data keys and
 * envelopes that were already encrypted on this device.
 */

export class AccountError extends Error {}

const json = { 'content-type': 'application/json' };

async function api(path: string, init: RequestInit = {}) {
  return fetch(path, { credentials: 'same-origin', ...init, signal: init.signal ?? AbortSignal.timeout(70_000) });
}

export interface Session {
  userId: string;
  email: string;
}

export async function getSession(): Promise<Session | null> {
  const res = await api('/api/auth/get-session').catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { user?: { id?: string; email?: string } } | null;
  return body?.user?.id && body.user.email ? { userId: body.user.id, email: body.user.email } : null;
}

async function authCall(path: 'sign-up/email' | 'sign-in/email', email: string, keys: AccountKeys) {
  const body = path === 'sign-up/email' ? { email, password: keys.authKey, name: 'Rambler' } : { email, password: keys.authKey };
  const res = await api(`/api/auth/${path}`, { method: 'POST', headers: json, body: JSON.stringify(body) });
  if (res.ok) return;
  const msg = ((await res.json().catch(() => null)) as { code?: string; message?: string } | null) ?? {};
  if (res.status === 403 || msg.code === 'EMAIL_NOT_VERIFIED') throw new AccountError('Check your inbox and confirm your email first, then sign in.');
  if (msg.code === 'USER_ALREADY_EXISTS' || msg.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') throw new AccountError('That email already has an account. Sign in instead.');
  if (res.status === 401) throw new AccountError('Email or password is wrong.');
  if (res.status === 429) throw new AccountError('Too many attempts. Wait a minute and try again.');
  throw new AccountError("Couldn't reach Ramble's server. Try again in a moment.");
}

export type AuthOutcome = { kind: 'signed-in'; session: Session; recoveryKey?: string } | { kind: 'verify-email' } | { kind: 'needs-recovery'; session: Session };

/** After authenticating: create the vault (first device) or adopt the account's data key. */
async function connectVault(session: Session, keys: AccountKeys): Promise<AuthOutcome> {
  const res = await api('/api/account/vault');
  if (res.status === 404) {
    const recovery = await createRecoveryKey();
    const blob: VaultBlob = {
      v: 1,
      kdf: { ...KDF_V1 },
      byPassword: toBase64(await vault.wrapDataKeyFor(keys.encKey)),
      byRecovery: toBase64(await vault.wrapDataKeyFor(recovery.key)),
    };
    const put = await api('/api/account/vault', { method: 'PUT', headers: json, body: JSON.stringify(blob) });
    if (!put.ok) throw new AccountError("Couldn't set up encrypted sync. Try again.");
    return { kind: 'signed-in', session, recoveryKey: recovery.text };
  }
  if (!res.ok) throw new AccountError("Couldn't reach Ramble's server. Try again in a moment.");
  const blob = vaultSchema.parse(await res.json());
  try {
    await vault.adoptDataKey(fromBase64(blob.byPassword).buffer, keys.encKey);
    return { kind: 'signed-in', session };
  } catch {
    // The password-wrapped key doesn't open with this password (e.g. it was changed elsewhere).
    return { kind: 'needs-recovery', session };
  }
}

/** Called with the session before this device's data is merged into the account; throw to stop. */
export type MergeGuard = (session: Session) => void;

export async function signUp(email: string, password: string, guard?: MergeGuard): Promise<AuthOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new AccountError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  const keys = await deriveAccountKeys(email, password);
  await authCall('sign-up/email', email, keys);
  const session = await getSession();
  if (!session) return { kind: 'verify-email' };
  await guarded(session, guard);
  return connectVault(session, keys);
}

async function guarded(session: Session, guard?: MergeGuard) {
  try {
    guard?.(session);
  } catch (e) {
    await signOut();
    throw e;
  }
}

export async function signIn(email: string, password: string, guard?: MergeGuard): Promise<AuthOutcome> {
  const keys = await deriveAccountKeys(email, password);
  await authCall('sign-in/email', email, keys);
  const session = await getSession();
  if (!session) throw new AccountError("Couldn't sign in. Try again.");
  await guarded(session, guard);
  return connectVault(session, keys);
}

/** Opens the vault with the recovery key, then re-wraps it for the current password. */
export async function restoreWithRecoveryKey(email: string, password: string, recoveryText: string): Promise<void> {
  const recovery = await parseRecoveryKey(recoveryText);
  if (!recovery) throw new AccountError("That recovery key doesn't look right. It starts with RMBL-.");
  const res = await api('/api/account/vault');
  if (!res.ok) throw new AccountError("Couldn't load your vault.");
  const blob = vaultSchema.parse(await res.json());
  try {
    await vault.adoptDataKey(fromBase64(blob.byRecovery).buffer, recovery);
  } catch {
    throw new AccountError("That recovery key doesn't match this account.");
  }
  const keys = await deriveAccountKeys(email, password);
  const updated: VaultBlob = { ...blob, byPassword: toBase64(await vault.wrapDataKeyFor(keys.encKey)) };
  const put = await api('/api/account/vault', { method: 'PUT', headers: json, body: JSON.stringify(updated) });
  if (!put.ok) throw new AccountError("Couldn't save your vault. Try again.");
}

export async function signOut(): Promise<void> {
  await api('/api/auth/sign-out', { method: 'POST', headers: json, body: '{}' }).catch(() => null);
}

export async function deleteAccount(): Promise<void> {
  const res = await api('/api/account', { method: 'DELETE' });
  if (!res.ok) throw new AccountError("Couldn't delete the account. Try again.");
}

// ---------------------------------------------------------------- sync

interface Cursor {
  lastPushed: number;
  lastSeq: number;
  uploaded: string[];
}

const cursorKey = (userId: string) => `ramble.sync.${userId}`;

function readCursor(userId: string): Cursor {
  try {
    return { lastPushed: 0, lastSeq: 0, uploaded: [], ...(JSON.parse(localStorage.getItem(cursorKey(userId)) ?? '{}') as Partial<Cursor>) };
  } catch {
    return { lastPushed: 0, lastSeq: 0, uploaded: [] };
  }
}

function writeCursor(userId: string, c: Cursor) {
  try {
    localStorage.setItem(cursorKey(userId), JSON.stringify(c));
  } catch {
    /* worst case we re-send what the server already has; pushes are idempotent */
  }
}

export function forgetSyncState(userId: string) {
  try {
    localStorage.removeItem(cursorKey(userId));
  } catch {
    /* nothing to forget */
  }
}

/** Push local changes, pull remote ones, upload new photos. Returns how many records changed here. */
export async function syncNow(userId: string): Promise<{ pulled: number }> {
  const cursor = readCursor(userId);

  // Push: rows changed since the last successful push, already encrypted.
  const rows = await vault.rowsChangedSince(cursor.lastPushed);
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const res = await api('/api/account/sync/push', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ envelopes: batch.map((r) => ({ id: r.id, v: r.v, iv: toBase64(r.iv), ct: toBase64(r.ct) })) }),
    });
    if (!res.ok) throw new AccountError(res.status === 413 ? 'Your sync storage is full.' : 'Sync failed. It will retry.');
    cursor.lastPushed = Math.max(cursor.lastPushed, ...batch.map((r) => r.updatedAt));
    writeCursor(userId, cursor);
  }

  // Pull: everything newer than our cursor; the vault keeps the newer version of each record.
  let pulled = 0;
  for (;;) {
    const res = await api(`/api/account/sync/pull?since=${cursor.lastSeq}&limit=500`);
    if (!res.ok) throw new AccountError('Sync failed. It will retry.');
    const page = syncPullResponseSchema.parse(await res.json());
    for (const e of page.envelopes) if (await vault.applyRemote({ id: e.id, iv: fromBase64(e.iv), ct: fromBase64(e.ct).buffer })) pulled++;
    cursor.lastSeq = page.nextSeq;
    writeCursor(userId, cursor);
    if (!page.more) break;
  }

  // Photos: upload any we haven't yet (encrypted bytes, as stored).
  const uploaded = new Set(cursor.uploaded);
  for (const id of await vault.mediaIds()) {
    if (uploaded.has(id)) continue;
    const row = await vault.getMediaRow(id);
    if (!row) continue;
    const res = await api(`/api/account/media/${id}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ v: row.v, iv: toBase64(row.iv), ct: toBase64(row.ct), mime: row.mime }),
    });
    if (res.status === 413) break; // quota: keep going without photos
    if (res.ok) uploaded.add(id);
  }
  cursor.uploaded = [...uploaded];
  writeCursor(userId, cursor);
  return { pulled };
}

/** Fetches an encrypted photo from the account when this device doesn't have it yet. */
export async function downloadPhoto(id: string): Promise<boolean> {
  const res = await api(`/api/account/media/${id}`).catch(() => null);
  if (!res?.ok) return false;
  const m = (await res.json()) as { v: number; iv: string; ct: string; mime: string };
  await vault.putMediaRow({ id, updatedAt: Date.now(), v: m.v, iv: fromBase64(m.iv), ct: fromBase64(m.ct).buffer, mime: m.mime });
  return true;
}
