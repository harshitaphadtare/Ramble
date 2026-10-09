import { describe, expect, it } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app';
import { createAuth } from '../src/lib/auth';
import { MemorySyncStore } from '../src/lib/syncStore';

const BASE = 'http://localhost:8787';
type Pull = { envelopes: { id: string; ct: string }[]; nextSeq: number; more: boolean };

function setup() {
  const db = { user: [], session: [], account: [], verification: [] };
  const auth = createAuth({ database: memoryAdapter(db), baseURL: BASE, secret: 'test-secret-'.repeat(4) });
  const app = createApp({ accounts: { auth, store: new MemorySyncStore() } });
  return { app };
}

/** A fake derived auth key: 43 base64url characters, like the device sends. */
const authKey = (seed: string) => (seed + 'x'.repeat(43)).slice(0, 43);

async function signUp(app: ReturnType<typeof createApp>, email: string) {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: authKey(email), name: 'Rambler' }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  expect(cookie).toContain('ramble');
  return (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { 'sec-fetch-site': 'same-origin', origin: BASE, cookie, ...(init.headers as Record<string, string>) } });
}

const b64 = (n: number) => Buffer.alloc(n, 7).toString('base64');
const vault = { v: 1, kdf: { alg: 'argon2id', m: 65536, t: 3, p: 1 }, byPassword: b64(40), byRecovery: b64(40) };
const envelope = (id: string) => ({ id, v: 1, iv: b64(12), ct: b64(48) });
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('accounts + encrypted sync', () => {
  it('requires a session', async () => {
    const { app } = setup();
    const res = await app.request('/api/account/vault', { headers: { 'sec-fetch-site': 'same-origin' } });
    expect(res.status).toBe(401);
    expect(await (await app.request('/api/features')).json()).toMatchObject({ accounts: true });
  });

  it('stores the vault and syncs envelopes with increasing sequence numbers', async () => {
    const { app } = setup();
    const me = await signUp(app, 'harshita@example.com');
    expect((await me('/api/account/vault')).status).toBe(404);
    expect((await me('/api/account/vault', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(vault) })).status).toBe(200);
    expect(await (await me('/api/account/vault')).json()).toEqual(vault);

    const push = await me('/api/account/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelopes: [envelope(ID1), envelope(ID2)] }) });
    expect(await push.json()).toEqual({ seq: 2 });
    // Updating ID1 gives it a newer sequence number, so other devices pull it again.
    await me('/api/account/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelopes: [envelope(ID1)] }) });
    const pulled = (await (await me('/api/account/sync/pull?since=2')).json()) as Pull;
    expect(pulled).toMatchObject({ nextSeq: 3, more: false });
    expect(pulled.envelopes.map((e) => e.id)).toEqual([ID1]);
  });

  it("never lets one user read or overwrite another user's data", async () => {
    const { app } = setup();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    await alice('/api/account/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelopes: [envelope(ID1)] }) });
    await alice('/api/account/media/' + ID2, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 1, iv: b64(12), ct: b64(300), mime: 'image/webp' }) });

    expect(((await (await bob('/api/account/sync/pull?since=0')).json()) as Pull).envelopes).toEqual([]);
    expect((await bob('/api/account/media/' + ID2)).status).toBe(404);
    // Bob pushing the same id creates HIS record; Alice's is untouched.
    await bob('/api/account/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelopes: [{ ...envelope(ID1), ct: b64(60) }] }) });
    const alicePull = (await (await alice('/api/account/sync/pull?since=0')).json()) as Pull;
    expect(alicePull.envelopes[0]!.ct).toBe(b64(48));
  });

  it('rejects malformed or oversized input', async () => {
    const { app } = setup();
    const me = await signUp(app, 'carol@example.com');
    const post = (body: unknown) => me('/api/account/sync/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ envelopes: [{ ...envelope(ID1), userId: 'someone-else', kind: 'place' }] })).status).toBe(200); // extra fields are stripped
    expect((await post({ envelopes: [{ ...envelope('not-a-uuid') }] })).status).toBe(400);
    expect((await post({ envelopes: [{ ...envelope(ID1), ct: { $gt: '' } }] })).status).toBe(400); // NoSQL operator injection
    expect((await me('/api/account/vault', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...vault, kdf: { ...vault.kdf, m: 8 } }) })).status).toBe(400); // weak KDF
  });

  it('deletes everything with the account', async () => {
    const { app } = setup();
    const me = await signUp(app, 'dave@example.com');
    await me('/api/account/vault', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(vault) });
    expect((await me('/api/account', { method: 'DELETE' })).status).toBe(200);
    expect((await me('/api/account/vault')).status).toBe(401); // session gone too
  });
});
