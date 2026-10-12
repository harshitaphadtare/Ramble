import { z } from 'zod';
import type { JournalEntry, Place, Visit } from '@ramble/shared';
import { fromBase64 as unb64, toBase64 as b64 } from './encoding';

/**
 * Backup file: your places, visits and journal notes, encrypted with a passphrase
 * you choose (PBKDF2-SHA256 → AES-GCM-256), so the file is safe to keep in email or a drive.
 * Photos aren't included (they'd make the file huge); sync covers those.
 */
const ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 10;

const fileSchema = z.object({
  format: z.literal('ramble-backup'),
  v: z.literal(1),
  kdf: z.object({ name: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(100_000).max(5_000_000), salt: z.string().max(64) }),
  iv: z.string().max(32),
  ct: z.string().max(40_000_000),
});

export interface BackupData {
  place: Place[];
  visit: Visit[];
  journal: JournalEntry[];
}

async function keyFrom(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  // The user's own passphrase, typed at backup time; nothing secret is stored here.
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']); // ggignore
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createBackup(data: BackupData, passphrase: string): Promise<Blob> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(passphrase, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('ramble-backup:v1') }, key, new TextEncoder().encode(JSON.stringify(data)));
  const file = { format: 'ramble-backup', v: 1, kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Decrypts a backup. Throws "Wrong passphrase or damaged file." on any tampering. */
export async function openBackup(text: string, passphrase: string): Promise<{ place: unknown[]; visit: unknown[]; journal: unknown[] }> {
  let file: z.infer<typeof fileSchema>;
  try {
    file = fileSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("That isn't a Ramble backup file.");
  }
  try {
    const key = await keyFrom(passphrase, unb64(file.kdf.salt), file.kdf.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv), additionalData: new TextEncoder().encode('ramble-backup:v1') }, key, unb64(file.ct));
    const data = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
    const arr = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).slice(0, 50_000) : []);
    return { place: arr('place'), visit: arr('visit'), journal: arr('journal') };
  } catch {
    throw new Error('Wrong passphrase or damaged file.');
  }
}
