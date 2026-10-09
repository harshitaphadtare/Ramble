import { describe, expect, it } from 'vitest';
import { sniffImage } from '../src/lib/media/photo';

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((ch) => ch.charCodeAt(0)) : [x])));

describe('sniffImage (file type from content, not the extension)', () => {
  it('recognises real image headers', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a))).toBe('png');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
    expect(sniffImage(bytes(0, 0, 0, 0x18, 'ftyp', 'heic'))).toBe('heic');
  });

  it('rejects anything else, e.g. an HTML file renamed to .jpg', () => {
    expect(sniffImage(bytes('<html><script>'))).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
  });
});
