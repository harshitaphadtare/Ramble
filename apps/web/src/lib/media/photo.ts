/**
 * Photos are re-encoded on the device before they're stored (docs/SECURITY.md §5.7):
 * re-drawing onto a canvas drops ALL metadata (EXIF, GPS, camera serial), and resizing keeps
 * storage small. The original file is never stored.
 */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 1600;

/** Magic bytes of the formats we accept; the file extension and MIME type are not trusted. */
export function sniffImage(head: Uint8Array): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  const b = head;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  const ascii = (from: number, len: number) => String.fromCharCode(...b.slice(from, from + len));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (ascii(4, 4) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(ascii(8, 4))) return 'heic';
  return null;
}

export class PhotoError extends Error {}

export async function preparePhoto(file: File): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string; width: number; height: number }> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('That photo is over 25 MB.');
  const kind = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!kind) throw new PhotoError("That doesn't look like a photo (JPEG, PNG, WebP or HEIC).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError(kind === 'heic' ? "This browser can't open HEIC photos. Try a JPEG." : "Couldn't open that photo.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP where supported (Safari falls back to JPEG); both come out without any metadata.
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
  if (blob.type !== 'image/webp') blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type, width, height };
}
