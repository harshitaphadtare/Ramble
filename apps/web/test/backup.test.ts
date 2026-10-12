import { describe, expect, it } from 'vitest';
import { createBackup, openBackup } from '../src/lib/backup';

const data = {
  place: [{ id: 'p1', name: 'University Lawn', kind: 'park' as const, lonLat: [144.96, -37.8] as [number, number], wantToGo: false, createdAt: 1, updatedAt: 1 }],
  visit: [],
  journal: [],
};

describe('backup file', () => {
  it('round-trips with the right passphrase and hides the contents', async () => {
    const text = await (await createBackup(data, 'correct horse battery')).text();
    expect(text).not.toContain('University Lawn');
    expect((await openBackup(text, 'correct horse battery')).place).toEqual(data.place);
  });

  it('rejects a wrong passphrase, a tampered file and junk', async () => {
    const text = await (await createBackup(data, 'correct horse battery')).text();
    await expect(openBackup(text, 'wrong horse battery')).rejects.toThrow('Wrong passphrase');
    const f = JSON.parse(text);
    f.ct = f.ct.slice(0, -4) + (f.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await expect(openBackup(JSON.stringify(f), 'correct horse battery')).rejects.toThrow('Wrong passphrase');
    await expect(openBackup('{"hello":1}', 'x')).rejects.toThrow("isn't a Ramble backup");
    await expect(createBackup(data, 'short')).rejects.toThrow('at least');
  });
});
