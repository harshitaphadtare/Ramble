import { recordSchemas, type RecordKind, type RecordOf } from '@ramble/shared';
import { createDeviceKey, createWrappedDataKey, ENVELOPE_V, open, openJson, seal, sealJson, unwrapDataKey, unwrapDataKeyForRewrap, wrapDataKey } from '../crypto/envelope';
import { RambleDB, type MediaRow, type RecordRow } from './db';

/** What a record's ciphertext contains (the server never sees this). */
type Inner = { kind: RecordKind; data: { updatedAt: number } } | { kind: RecordKind; deleted: true; updatedAt: number };
const innerUpdatedAt = (i: Inner) => ('deleted' in i ? i.updatedAt : i.data.updatedAt);

export interface LoadedData {
  place: RecordOf<'place'>[];
  visit: RecordOf<'visit'>[];
  journal: RecordOf<'journal'>[];
  /** Records that failed to decrypt or validate (tampered or corrupted). Never shown, never trusted. */
  unreadable: number;
}

/**
 * The only way in or out of the on-device database: every record is validated, then encrypted
 * with the data key before it is written, and decrypted + validated again when read.
 */
export class Vault {
  private dk: CryptoKey | null = null;

  constructor(readonly db: RambleDB = new RambleDB()) {}

  /** Loads (or on first run creates) the device key and data key. */
  async unlock(): Promise<void> {
    if (this.dk) return;
    const device = await this.db.keys.get('device');
    const wrapped = await this.db.keys.get('dk');
    if (device?.key && wrapped?.wrapped) {
      this.dk = await unwrapDataKey(wrapped.wrapped, device.key);
      return;
    }
    const key = await createDeviceKey();
    const dkWrapped = await createWrappedDataKey(key);
    await this.db.transaction('rw', this.db.keys, async () => {
      await this.db.keys.put({ id: 'device', key });
      await this.db.keys.put({ id: 'dk', wrapped: dkWrapped });
    });
    this.dk = await unwrapDataKey(dkWrapped, key);
  }

  private key(): CryptoKey {
    if (!this.dk) throw new Error('Vault is locked');
    return this.dk;
  }

  async put<K extends RecordKind>(kind: K, record: RecordOf<K>): Promise<void> {
    const valid = recordSchemas[kind].parse(record) as RecordOf<K>;
    const { iv, ct } = await sealJson(this.key(), valid.id, { kind, data: valid });
    await this.db.records.put({ id: valid.id, kind, updatedAt: valid.updatedAt, deleted: 0, v: ENVELOPE_V, iv, ct });
  }

  /** Deletion keeps an encrypted tombstone (needed later for sync), with no content inside. */
  async remove(kind: RecordKind, id: string): Promise<void> {
    const now = Date.now();
    const { iv, ct } = await sealJson(this.key(), id, { kind, deleted: true, updatedAt: now });
    await this.db.records.put({ id, kind, updatedAt: now, deleted: 1, v: ENVELOPE_V, iv, ct });
  }

  async loadAll(): Promise<LoadedData> {
    const out: LoadedData = { place: [], visit: [], journal: [], unreadable: 0 };
    const rows: RecordRow[] = await this.db.records.filter((r) => r.deleted === 0).toArray();
    for (const row of rows) {
      try {
        const { kind, data } = (await openJson(this.key(), row.id, row)) as { kind: RecordKind; data: unknown };
        if (kind !== row.kind) throw new Error('kind mismatch');
        const parsed = recordSchemas[kind].parse(data);
        (out[kind] as unknown[]).push(parsed);
      } catch {
        out.unreadable++;
      }
    }
    return out;
  }

  async putMedia(id: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<void> {
    const { iv, ct } = await seal(this.key(), id, bytes);
    await this.db.media.put({ id, updatedAt: Date.now(), v: ENVELOPE_V, iv, ct, mime });
  }

  async getMedia(id: string): Promise<Blob | null> {
    const row = await this.db.media.get(id);
    if (!row) return null;
    try {
      return new Blob([await open(this.key(), id, row)], { type: row.mime });
    } catch {
      return null;
    }
  }

  async removeMedia(id: string): Promise<void> {
    await this.db.media.delete(id);
  }

  // ---------------------------------------------------------------- account sync

  /** The data key wrapped by an account key (password- or recovery-derived) for the server vault. */
  async wrapDataKeyFor(kek: CryptoKey): Promise<ArrayBuffer> {
    const device = await this.db.keys.get('device');
    const wrapped = await this.db.keys.get('dk');
    if (!device?.key || !wrapped?.wrapped) throw new Error('Vault is locked');
    return wrapDataKey(await unwrapDataKeyForRewrap(wrapped.wrapped, device.key), kek);
  }

  /**
   * Switches this device to the account's data key (signing in on a new device). Anything already
   * saved here is re-encrypted with the account key first, so nothing is lost.
   */
  async adoptDataKey(wrappedByAccount: ArrayBuffer, kek: CryptoKey): Promise<void> {
    const accountDk = await unwrapDataKeyForRewrap(wrappedByAccount, kek);
    const device = await this.db.keys.get('device');
    if (!device?.key) throw new Error('Vault is locked');
    const oldDk = this.key();
    const rows = await this.db.records.toArray();
    const media = await this.db.media.toArray();
    const resealed: RecordRow[] = [];
    for (const row of rows) {
      try {
        const plain = await open(oldDk, row.id, row);
        resealed.push({ ...row, ...(await seal(accountDk, row.id, plain)) });
      } catch {
        /* unreadable rows were never trusted; drop them */
      }
    }
    const resealedMedia: MediaRow[] = [];
    for (const m of media) {
      try {
        resealedMedia.push({ ...m, ...(await seal(accountDk, m.id, await open(oldDk, m.id, m))) });
      } catch {
        /* skip */
      }
    }
    const newWrapped = await wrapDataKey(accountDk, device.key);
    await this.db.transaction('rw', this.db.records, this.db.media, this.db.keys, async () => {
      await this.db.records.clear();
      await this.db.records.bulkPut(resealed);
      await this.db.media.clear();
      await this.db.media.bulkPut(resealedMedia);
      await this.db.keys.put({ id: 'dk', wrapped: newWrapped });
    });
    this.dk = await unwrapDataKey(newWrapped, device.key);
  }

  /** Rows (records and tombstones) changed after `since`, still encrypted, for pushing. */
  rowsChangedSince(since: number): Promise<RecordRow[]> {
    return this.db.records.where('updatedAt').above(since).toArray();
  }

  /**
   * Applies an envelope pulled from the server: decrypts it to read the inner timestamp and keeps
   * whichever version is newer (last write wins). Tampered envelopes are ignored.
   */
  async applyRemote(env: { id: string; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }): Promise<boolean> {
    let inner: Inner;
    try {
      inner = (await openJson(this.key(), env.id, env)) as Inner;
    } catch {
      return false;
    }
    const updatedAt = innerUpdatedAt(inner);
    const local = await this.db.records.get(env.id);
    if (local && local.updatedAt >= updatedAt) return false;
    await this.db.records.put({ id: env.id, kind: inner.kind, updatedAt, deleted: 'deleted' in inner ? 1 : 0, v: ENVELOPE_V, iv: env.iv, ct: env.ct });
    return true;
  }

  mediaIds(): Promise<string[]> {
    return this.db.media.toCollection().primaryKeys() as Promise<string[]>;
  }

  getMediaRow(id: string): Promise<MediaRow | undefined> {
    return this.db.media.get(id);
  }

  async putMediaRow(row: MediaRow): Promise<void> {
    await this.db.media.put(row);
  }

  /**
   * "Delete all data": crypto-shred first (drop the keys, so any leftover ciphertext is
   * unreadable), then clear every table.
   */
  async wipe(): Promise<void> {
    await this.db.keys.clear();
    this.dk = null;
    await Promise.all([this.db.records.clear(), this.db.media.clear()]);
  }
}
