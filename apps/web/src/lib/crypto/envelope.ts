/**
 * Envelope encryption for everything the user creates (docs/SECURITY.md §5.3).
 *
 * - One random AES-GCM-256 data key (DK) encrypts every record.
 * - The DK is only ever stored wrapped (AES-KW) by a non-extractable device key.
 * - Every encryption uses a fresh 96-bit IV, and the AAD binds the ciphertext to its record id
 *   and format version, so a ciphertext can't be swapped into another record undetected.
 */
const subtle = () => globalThis.crypto.subtle;
export const ENVELOPE_V = 1;

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

const aad = (id: string, v: number) => new TextEncoder().encode(`${id}:${v}`);

/** A new non-extractable key-wrapping key that lives only in this browser's storage. */
export function createDeviceKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

/** A new data key, returned already wrapped: the raw key bytes never leave WebCrypto. */
export async function createWrappedDataKey(deviceKey: CryptoKey): Promise<ArrayBuffer> {
  const dk = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return subtle().wrapKey('raw', dk, deviceKey, 'AES-KW');
}

/** Unwraps the data key as non-extractable: page code can use it but can't read its bytes. */
export function unwrapDataKey(wrapped: ArrayBuffer, deviceKey: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey('raw', wrapped, deviceKey, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(dk: CryptoKey, id: string, plaintext: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad(id, ENVELOPE_V) }, dk, plaintext);
  return { iv, ct };
}

/** Throws if the ciphertext, IV, id or version was tampered with. */
export async function open(dk: CryptoKey, id: string, sealed: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: sealed.iv, additionalData: aad(id, ENVELOPE_V) }, dk, sealed.ct);
  return new Uint8Array(pt);
}

export const sealJson = (dk: CryptoKey, id: string, value: unknown) => seal(dk, id, new TextEncoder().encode(JSON.stringify(value)));
export const openJson = async (dk: CryptoKey, id: string, sealed: Sealed): Promise<unknown> => JSON.parse(new TextDecoder().decode(await open(dk, id, sealed)));
