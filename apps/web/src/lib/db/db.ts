import Dexie, { type EntityTable } from 'dexie';
import type { RecordKind } from '@ramble/shared';

/**
 * On-device storage. Only the repository (repo.ts) touches these tables.
 * Plaintext columns are limited to what IndexedDB needs for indexing (docs/ARCHITECTURE.md §6.3).
 */
export interface RecordRow {
  id: string;
  kind: RecordKind;
  updatedAt: number;
  deleted: 0 | 1;
  v: number;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

export interface MediaRow {
  id: string;
  updatedAt: number;
  v: number;
  iv: Uint8Array<ArrayBuffer>;
  /** Encrypted image bytes (WebP, metadata stripped before encryption). */
  ct: ArrayBuffer;
  mime: string;
}

/** 'device' holds the non-extractable wrapping key; 'dk' holds the wrapped data key. */
export interface KeyRow {
  id: 'device' | 'dk';
  key?: CryptoKey;
  wrapped?: ArrayBuffer;
}

export class RambleDB extends Dexie {
  records!: EntityTable<RecordRow, 'id'>;
  media!: EntityTable<MediaRow, 'id'>;
  keys!: EntityTable<KeyRow, 'id'>;

  constructor(name = 'ramble') {
    super(name);
    this.version(1).stores({
      records: 'id, kind, updatedAt, [kind+deleted]',
      media: 'id, updatedAt',
      keys: 'id',
    });
  }
}
