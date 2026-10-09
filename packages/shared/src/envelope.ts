import { z } from 'zod';

/**
 * End-to-end-encrypted sync (docs/ARCHITECTURE.md §10). Everything here is opaque to the server:
 * the record kind, timestamps and the deleted flag all live INSIDE the ciphertext.
 */
export const ENVELOPE_VERSION = 1 as const;

/** Max ciphertext size for a single record; media blobs travel separately. */
export const MAX_RECORD_BYTES = 64 * 1024;
/** Max encrypted photo size, and the per-account media quota. */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
export const MEDIA_QUOTA_BYTES = 50 * 1024 * 1024;

const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const b64Len = (bytes: number) => Math.ceil(bytes / 3) * 4;

/** One encrypted record as it travels and as the server stores it. */
export const wireEnvelopeSchema = z.object({
  id: z.string().uuid(),
  v: z.literal(ENVELOPE_VERSION),
  iv: base64.length(16), // 12 bytes
  ct: base64.min(24).max(b64Len(MAX_RECORD_BYTES)),
});
export type WireEnvelope = z.infer<typeof wireEnvelopeSchema>;

export const syncPushSchema = z.object({
  envelopes: z.array(wireEnvelopeSchema).min(1).max(100),
});

export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export const syncPullResponseSchema = z.object({
  envelopes: z.array(wireEnvelopeSchema.extend({ seq: z.number().int().positive() })),
  nextSeq: z.number().int().min(0),
  more: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const mediaUploadSchema = z.object({
  v: z.literal(ENVELOPE_VERSION),
  iv: base64.length(16),
  ct: base64.min(24).max(b64Len(MAX_MEDIA_BYTES)),
  mime: z.enum(['image/webp', 'image/jpeg']),
});
export type MediaUpload = z.infer<typeof mediaUploadSchema>;

/**
 * The account vault: the data key wrapped (AES-KW, 40 bytes) by the password-derived key and by
 * the recovery key, plus the Argon2id parameters used. The server can't unwrap either.
 */
export const KDF_V1 = { alg: 'argon2id', m: 65536, t: 3, p: 1 } as const;

export const vaultSchema = z.object({
  v: z.literal(1),
  kdf: z.object({ alg: z.literal('argon2id'), m: z.number().int().min(19456).max(1048576), t: z.number().int().min(2).max(10), p: z.number().int().min(1).max(4) }),
  byPassword: base64.length(b64Len(40)),
  byRecovery: base64.length(b64Len(40)),
});
export type VaultBlob = z.infer<typeof vaultSchema>;
