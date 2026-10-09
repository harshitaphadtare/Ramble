// Generates simple PNG app icons (forest background, sun-over-hill mark) with no image libraries.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '../public/icons');
mkdirSync(out, { recursive: true });

const FOREST = [31, 61, 43], MOSS = [127, 176, 122], SUN = [232, 131, 58], SAND = [246, 244, 238];

function draw(size, padding) {
  const px = Buffer.alloc(size * size * 4);
  const s = size * (1 - padding * 2), o = size * padding;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - o) / s, v = (y - o) / s; // 0..1 inside the safe area
    let c = FOREST;
    const sun = Math.hypot(u - 0.62, v - 0.38) < 0.16;
    const hill = v > 0.62 - 0.22 * Math.cos((u - 0.38) * 2.6) && v < 0.86 && u > 0.08 && u < 0.92;
    const path_ = Math.abs(u - (0.5 + 0.12 * Math.sin(v * 9))) < 0.025 && v > 0.62 && v < 0.86;
    if (sun) c = SUN;
    if (hill) c = MOSS;
    if (hill && path_) c = SAND;
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

writeFileSync(path.join(out, 'icon-192.png'), draw(192, 0.08));
writeFileSync(path.join(out, 'icon-512.png'), draw(512, 0.08));
writeFileSync(path.join(out, 'icon-512-maskable.png'), draw(512, 0.2));
writeFileSync(path.join(out, 'apple-touch-icon.png'), draw(180, 0.1));
console.log('icons written to', out);
