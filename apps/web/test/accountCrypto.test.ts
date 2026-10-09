import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Place } from '@ramble/shared';
import { createRecoveryKey, deriveAccountKeys, parseRecoveryKey } from '../src/lib/crypto/account';
import { RambleDB } from '../src/lib/db/db';
import { Vault } from '../src/lib/db/repo';

// Light KDF settings keep the tests fast; production uses KDF_V1 (64 MiB, t=3).
const FAST = { m: 19456, t: 2, p: 1 };
let n = 0;
const freshVault = async () => {
  const v = new Vault(new RambleDB(`acct-${++n}`));
  await v.unlock();
  return v;
};
const place = (id: string, name: string, updatedAt = 1): Place => ({ id, name, kind: 'park', lonLat: [144.98, -37.79], wantToGo: false, createdAt: 1, updatedAt });

describe('account keys', () => {
  it('derives the same keys from the same email + password, and a 43-char auth key', async () => {
    const a = await deriveAccountKeys('Me@Example.com ', 'correct horse battery', FAST);
    const b = await deriveAccountKeys('me@example.com', 'correct horse battery', FAST);
    expect(a.authKey).toBe(b.authKey);
    expect(a.authKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const other = await deriveAccountKeys('me@example.com', 'correct horse battery!', FAST);
    expect(other.authKey).not.toBe(a.authKey);
  });

  it('formats and parses recovery keys (forgiving about case, spaces and look-alike letters)', async () => {
    const { text } = await createRecoveryKey();
    expect(text).toMatch(/^RMBL(-[0-9A-Z]{4}){13}$/);
    expect(await parseRecoveryKey(text.toLowerCase().replace(/-/g, ' '))).not.toBeNull();
    expect(await parseRecoveryKey('RMBL-1234')).toBeNull();
  });
});

describe('sharing the data key between devices', () => {
  it('a second device adopts the account key, keeps its own data, and reads the first device', async () => {
    const keys = await deriveAccountKeys('me@example.com', 'correct horse battery', FAST);
    const phone = await freshVault();
    const laptop = await freshVault();
    await phone.put('place', place('11111111-1111-4111-8111-111111111111', 'Edinburgh Gardens'));
    await laptop.put('place', place('22222222-2222-4222-8222-222222222222', 'Laptop-only spot'));

    // The phone sets up the account vault; the laptop signs in and adopts it.
    const wrapped = await phone.wrapDataKeyFor(keys.encKey);
    await laptop.adoptDataKey(wrapped, keys.encKey);
    expect((await laptop.loadAll()).place.map((p) => p.name)).toEqual(['Laptop-only spot']); // nothing lost

    // Sync the phone's record across: the laptop can now decrypt it.
    for (const row of await phone.rowsChangedSince(0)) expect(await laptop.applyRemote(row)).toBe(true);
    expect((await laptop.loadAll()).place.map((p) => p.name).sort()).toEqual(['Edinburgh Gardens', 'Laptop-only spot']);
  });

  it('keeps the newer version (last write wins) and ignores tampered envelopes', async () => {
    const keys = await deriveAccountKeys('me@example.com', 'correct horse battery', FAST);
    const a = await freshVault();
    const b = await freshVault();
    await b.adoptDataKey(await a.wrapDataKeyFor(keys.encKey), keys.encKey);
    const id = '33333333-3333-4333-8333-333333333333';
    await a.put('place', place(id, 'Old name', 1));
    await b.put('place', place(id, 'New name', 5));
    const [older] = await a.rowsChangedSince(0);
    expect(await b.applyRemote(older!)).toBe(false); // b's version is newer
    const flipped = new Uint8Array(older!.ct.slice(0));
    flipped[3]! ^= 1;
    expect(await b.applyRemote({ ...older!, ct: flipped.buffer })).toBe(false);
    expect((await b.loadAll()).place[0]!.name).toBe('New name');
  });

  it("a wrong password can't unwrap the account key", async () => {
    const right = await deriveAccountKeys('me@example.com', 'correct horse battery', FAST);
    const wrong = await deriveAccountKeys('me@example.com', 'wrong horse battery', FAST);
    const a = await freshVault();
    const b = await freshVault();
    await expect(b.adoptDataKey(await a.wrapDataKeyFor(right.encKey), wrong.encKey)).rejects.toThrow();
  });
});
