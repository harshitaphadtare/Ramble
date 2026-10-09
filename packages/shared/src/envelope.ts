import { z } from 'zod';

/** Every user record is one of these kinds. The kind lives INSIDE the ciphertext on the server. */
export const KINDS = ['place', 'visit', 'walk', 'journal', 'list', 'feedback'] as const;
export type Kind = (typeof KINDS)[number];

export const ENVELOPE_VERSION = 1 as const;

/** Max ciphertext size for a single record (media blobs are separate). */
export const MAX_RECORD_BYTES = 64 * 1024;

const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

/** Wire format for sync: what the device sends and the server stores (opaque to the server). */
export const wireEnvelopeSchema = z.object({
  id: z.string().uuid(),
  v: z.literal(ENVELOPE_VERSION),
  iv: base64.length(16), // 12 bytes, base64
  ct: base64.min(24).max(Math.ceil((MAX_RECORD_BYTES * 4) / 3) + 4),
});
export type WireEnvelope = z.infer<typeof wireEnvelopeSchema>;

export const syncPushSchema = z.object({
  envelopes: z.array(wireEnvelopeSchema).min(1).max(100),
});

export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
