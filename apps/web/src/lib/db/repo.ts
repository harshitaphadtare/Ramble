import { recordSchemas, type RecordKind, type RecordOf } from '@ramble/shared';
import { createDeviceKey, createWrappedDataKey, ENVELOPE_V, open, openJson, seal, sealJson, unwrapDataKey } from '../crypto/envelope';
import { RambleDB, type RecordRow } from './db';

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
