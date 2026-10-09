import { argon2id } from 'hash-wasm';
import { KDF_V1 } from '@ramble/shared';

/**
 * Zero-knowledge account keys (docs/SECURITY.md §6.1). The password never leaves this device:
 *
 *   password ──Argon2id(64 MiB, t=3)──► master key ──HKDF "ramble-auth-v1"──► auth key  → server (as "password")
 *                                                  └─HKDF "ramble-enc-v1"───► encryption key (stays here)
 *
 * The server only ever sees the auth key, which can't be turned back into the encryption key.
 */
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();

export const MIN_PASSWORD_LENGTH = 10;

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Deterministic per-account salt, so no salt needs to be fetched (and leaked) before sign-in. */
async function saltFor(email: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await subtle().digest('SHA-256', enc.encode(`ramble:v1:${email.trim().toLowerCase()}`));
  return new Uint8Array(digest).slice(0, 16);
}

export interface AccountKeys {
  /** Sent to the server as the "password". 43 base64url characters. */
  authKey: string;
  /** Wraps / unwraps the data key. Non-extractable; never leaves WebCrypto. */
  encKey: CryptoKey;
}

export async function deriveAccountKeys(email: string, password: string, kdf: { m: number; t: number; p: number } = KDF_V1): Promise<AccountKeys> {
  const master = await argon2id({
    password,
    salt: await saltFor(email),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m, // KiB
    hashLength: 32,
    outputType: 'binary',
  });
  const hkdf = await subtle().importKey('raw', new Uint8Array(master), 'HKDF', false, ['deriveBits', 'deriveKey']);
  master.fill(0);
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) });
  const authBits = new Uint8Array(await subtle().deriveBits(params('ramble-auth-v1'), hkdf, 256));
  const encKey = await subtle().deriveKey(params('ramble-enc-v1'), hkdf, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  return { authKey: toBase64Url(authBits), encKey };
}

// ---------------------------------------------------------------- recovery key

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.toUpperCase().replace(/^RMBL/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return out.length === 32 ? new Uint8Array(out) : null;
}

const importRecovery = (raw: Uint8Array<ArrayBuffer>) => subtle().importKey('raw', raw, 'AES-KW', false, ['wrapKey', 'unwrapKey']);

/** 256 random bits, shown once as "RMBL-XXXX-…" (13 groups of 4). */
export async function createRecoveryKey(): Promise<{ text: string; key: CryptoKey }> {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const groups = base32(raw).match(/.{1,4}/g)!;
  const key = await importRecovery(raw);
  raw.fill(0);
  return { text: ['RMBL', ...groups].join('-'), key };
}

export async function parseRecoveryKey(text: string): Promise<CryptoKey | null> {
  const raw = fromBase32(text);
  return raw ? importRecovery(raw) : null;
}
