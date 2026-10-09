import { Binary, type Db } from 'mongodb';
import { MEDIA_QUOTA_BYTES, type VaultBlob, type WireEnvelope } from '@ramble/shared';

/**
 * Where synced ciphertext lives. The server never sees plaintext: it stores opaque envelopes,
 * a wrapped-key vault and encrypted photos, always scoped to the signed-in user's id
 * (docs/SECURITY.md §7.2). Two implementations: MongoDB (production) and memory (tests).
 */
export interface StoredEnvelope extends WireEnvelope {
  seq: number;
}

export interface StoredMedia {
  v: 1;
  iv: string;
  ct: string;
  mime: string;
}

export class QuotaExceededError extends Error {}

export interface SyncStore {
  getVault(userId: string): Promise<VaultBlob | null>;
  putVault(userId: string, vault: VaultBlob): Promise<void>;
  /** Upserts envelopes, assigning each a new per-user sequence number. Returns the highest seq. */
  push(userId: string, envelopes: WireEnvelope[]): Promise<number>;
  pull(userId: string, since: number, limit: number): Promise<StoredEnvelope[]>;
  putMedia(userId: string, id: string, media: StoredMedia): Promise<void>;
  getMedia(userId: string, id: string): Promise<StoredMedia | null>;
  deleteUser(userId: string): Promise<void>;
}

const MAX_RECORDS_PER_USER = 20_000;
const b64Bytes = (s: string) => Math.floor((s.length * 3) / 4);

export class MemorySyncStore implements SyncStore {
  private vaults = new Map<string, VaultBlob>();
  private records = new Map<string, Map<string, StoredEnvelope>>();
  private seqs = new Map<string, number>();
  private media = new Map<string, Map<string, StoredMedia>>();

  async getVault(userId: string) {
    return this.vaults.get(userId) ?? null;
  }
  async putVault(userId: string, vault: VaultBlob) {
    this.vaults.set(userId, vault);
  }
  async push(userId: string, envelopes: WireEnvelope[]) {
    const mine = this.records.get(userId) ?? new Map<string, StoredEnvelope>();
    const fresh = envelopes.filter((e) => !mine.has(e.id)).length;
    if (mine.size + fresh > MAX_RECORDS_PER_USER) throw new QuotaExceededError('record limit');
    let seq = this.seqs.get(userId) ?? 0;
    for (const e of envelopes) mine.set(e.id, { id: e.id, v: e.v, iv: e.iv, ct: e.ct, seq: ++seq });
    this.records.set(userId, mine);
    this.seqs.set(userId, seq);
    return seq;
  }
  async pull(userId: string, since: number, limit: number) {
    return [...(this.records.get(userId)?.values() ?? [])].filter((e) => e.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit);
  }
  async putMedia(userId: string, id: string, m: StoredMedia) {
    const mine = this.media.get(userId) ?? new Map<string, StoredMedia>();
    const used = [...mine.entries()].filter(([k]) => k !== id).reduce((n, [, x]) => n + b64Bytes(x.ct), 0);
    if (used + b64Bytes(m.ct) > MEDIA_QUOTA_BYTES) throw new QuotaExceededError('media quota');
    mine.set(id, m);
    this.media.set(userId, mine);
  }
  async getMedia(userId: string, id: string) {
    return this.media.get(userId)?.get(id) ?? null;
  }
  async deleteUser(userId: string) {
    this.vaults.delete(userId);
    this.records.delete(userId);
    this.seqs.delete(userId);
    this.media.delete(userId);
  }
}

interface RecordDoc {
  userId: string;
  id: string;
  seq: number;
  v: 1;
  iv: string;
  ct: Binary;
  receivedAt: Date;
}
interface MediaDoc {
  userId: string;
  id: string;
  v: 1;
  iv: string;
  ct: Binary;
  mime: string;
  size: number;
}

export class MongoSyncStore implements SyncStore {
  constructor(private readonly db: Db) {}

  /** Idempotent; called once at start-up. */
  async ensureIndexes() {
    await Promise.all([
      this.db.collection('vaults').createIndex({ userId: 1 }, { unique: true }),
      this.db.collection('records').createIndex({ userId: 1, id: 1 }, { unique: true }),
      this.db.collection('records').createIndex({ userId: 1, seq: 1 }),
      this.db.collection('counters').createIndex({ userId: 1 }, { unique: true }),
      this.db.collection('media').createIndex({ userId: 1, id: 1 }, { unique: true }),
    ]);
  }

  async getVault(userId: string) {
    const doc = await this.db.collection<{ userId: string; vault: VaultBlob }>('vaults').findOne({ userId });
    return doc?.vault ?? null;
  }

  async putVault(userId: string, vault: VaultBlob) {
    await this.db.collection('vaults').updateOne({ userId }, { $set: { userId, vault, updatedAt: new Date() } }, { upsert: true });
  }

  async push(userId: string, envelopes: WireEnvelope[]) {
    const records = this.db.collection<RecordDoc>('records');
    if ((await records.countDocuments({ userId })) + envelopes.length > MAX_RECORDS_PER_USER) throw new QuotaExceededError('record limit');
    // Reserve a block of sequence numbers atomically, then upsert each envelope with one of them.
    const counter = await this.db
      .collection<{ userId: string; seq: number }>('counters')
      .findOneAndUpdate({ userId }, { $inc: { seq: envelopes.length } }, { upsert: true, returnDocument: 'after' });
    const last = counter?.seq ?? envelopes.length;
    let seq = last - envelopes.length;
    await records.bulkWrite(
      envelopes.map((e) => ({
        updateOne: {
          filter: { userId, id: e.id },
          update: { $set: { userId, id: e.id, seq: ++seq, v: e.v, iv: e.iv, ct: new Binary(Buffer.from(e.ct, 'base64')), receivedAt: new Date() } },
          upsert: true,
        },
      })),
      { ordered: true },
    );
    return last;
  }

  async pull(userId: string, since: number, limit: number) {
    const docs = await this.db.collection<RecordDoc>('records').find({ userId, seq: { $gt: since } }).sort({ seq: 1 }).limit(limit).toArray();
    return docs.map((d) => ({ id: d.id, v: d.v, iv: d.iv, ct: Buffer.from(d.ct.buffer).toString('base64'), seq: d.seq }));
  }

  async putMedia(userId: string, id: string, m: StoredMedia) {
    const media = this.db.collection<MediaDoc>('media');
    const size = b64Bytes(m.ct);
    const [usage] = await media.aggregate<{ total: number }>([{ $match: { userId, id: { $ne: id } } }, { $group: { _id: null, total: { $sum: '$size' } } }]).toArray();
    if ((usage?.total ?? 0) + size > MEDIA_QUOTA_BYTES) throw new QuotaExceededError('media quota');
    await media.updateOne({ userId, id }, { $set: { userId, id, v: m.v, iv: m.iv, ct: new Binary(Buffer.from(m.ct, 'base64')), mime: m.mime, size } }, { upsert: true });
  }

  async getMedia(userId: string, id: string) {
    const d = await this.db.collection<MediaDoc>('media').findOne({ userId, id });
    return d ? { v: d.v, iv: d.iv, ct: Buffer.from(d.ct.buffer).toString('base64'), mime: d.mime } : null;
  }

  async deleteUser(userId: string) {
    await Promise.all(['vaults', 'records', 'counters', 'media'].map((c) => this.db.collection(c).deleteMany({ userId })));
  }
}
