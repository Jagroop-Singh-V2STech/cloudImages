/**
 * Optional client-side image compression before upload.
 * Resizes so the longest side is at most MAX_SIDE and re-encodes at QUALITY.
 * The original File is returned untouched when compression wouldn't help
 * (unsupported type, already small, or the result came out bigger).
 */

const MAX_SIDE = 2560;
const QUALITY = 0.85;
// GIF (animation), SVG (vector) and HEIC (not decodable in most browsers) are skipped.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function compressImage(file) {
  if (!COMPRESSIBLE.has(file.type) || typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    // imageOrientation applies EXIF rotation so portrait phone photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  // A PNG that doesn't need resizing gains nothing from a lossless re-encode.
  if (scale === 1 && file.type === 'image/png') {
    bitmap.close?.();
    return file;
  }

  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((r) => canvas.toBlob(r, file.type, QUALITY));
  if (!blob || blob.size >= file.size) return file;
  // Keep the original name, extension and type.
  return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
}
