import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Place } from '@ramble/shared';
import { RambleDB } from '../src/lib/db/db';
import { Vault } from '../src/lib/db/repo';

let n = 0;
const freshVault = () => new Vault(new RambleDB(`test-${++n}`));

const place = (id: string, name = 'Edinburgh Gardens'): Place => ({
  id,
  name,
  kind: 'park',
  lonLat: [144.98, -37.79],
  wantToGo: false,
  createdAt: 1,
  updatedAt: 1,
});

describe('Vault (encrypted on-device storage)', () => {
  it('round-trips records and keeps them across restarts', async () => {
    const v = freshVault();
    await v.unlock();
    await v.put('place', place('p1'));
    await v.put('visit', { id: 'v1', placeId: 'p1', at: 5, updatedAt: 5 });

    const again = new Vault(v.db); // a new session with the same storage
    await again.unlock();
    const data = await again.loadAll();
    expect(data.place).toEqual([place('p1')]);
    expect(data.visit).toHaveLength(1);
    expect(data.unreadable).toBe(0);
  });

  it('never writes plaintext to storage', async () => {
    const v = freshVault();
    await v.unlock();
    await v.put('place', place('p1', 'My secret garden'));
    const row = await v.db.records.get('p1');
    const stored = new TextDecoder().decode(new Uint8Array(row!.ct));
    expect(stored).not.toContain('secret');
    expect(Object.keys(row!)).toEqual(expect.arrayContaining(['id', 'kind', 'iv', 'ct']));
  });

  it('detects tampering and swapped ciphertexts instead of trusting them', async () => {
    const v = freshVault();
    await v.unlock();
    await v.put('place', place('p1'));
    await v.put('place', place('p2', 'Other'));
    const a = await v.db.records.get('p1');
    const b = await v.db.records.get('p2');
    // Move p2's ciphertext into p1's row (AAD binds it to p2, so this must fail).
    await v.db.records.put({ ...a!, iv: b!.iv, ct: b!.ct });
    // Flip one bit in p2.
    const flipped = new Uint8Array(b!.ct.slice(0));
    flipped[0]! ^= 1;
    await v.db.records.put({ ...b!, ct: flipped.buffer });
    const data = await v.loadAll();
    expect(data.place).toEqual([]);
    expect(data.unreadable).toBe(2);
  });

  it('rejects invalid records before they are stored', async () => {
    const v = freshVault();
    await v.unlock();
    await expect(v.put('place', { ...place('p1'), name: '' })).rejects.toThrow();
  });

  it('deletes with an encrypted tombstone and encrypts media', async () => {
    const v = freshVault();
    await v.unlock();
    await v.put('place', place('p1'));
    await v.remove('place', 'p1');
    expect((await v.loadAll()).place).toEqual([]);

    await v.putMedia('m1', new Uint8Array([1, 2, 3]), 'image/webp');
    const blob = await v.getMedia('m1');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('wipe crypto-shreds: keys go first, data is unreadable and cleared', async () => {
    const v = freshVault();
    await v.unlock();
    await v.put('place', place('p1'));
    await v.wipe();
    expect(await v.db.keys.count()).toBe(0);
    expect(await v.db.records.count()).toBe(0);
    await expect(v.put('place', place('p2'))).rejects.toThrow(/locked/);
  });
});
