/**
 * Optional client-side image compression before upload.
 *
 * Resizes so the longest side is at most MAX_SIDE and re-encodes as WebP,
 * which is typically 25–35% smaller than JPEG at the same visual quality and
 * keeps PNG transparency. If the browser can't encode WebP (canvas.toBlob
 * silently falls back to PNG), we re-encode in the original format instead.
 *
 * AVIF would be smaller still, but browsers can't encode it from a canvas and
 * Drive doesn't generate thumbnails for it, so WebP is the practical choice.
 *
 * The original File is returned untouched when compression wouldn't help
 * (unsupported type, or the result came out bigger).
 */

const MAX_SIDE = 2560;
const WEBP_QUALITY = 0.82;
const FALLBACK_QUALITY = 0.85;
// GIF (animation), SVG (vector) and HEIC (not decodable in most browsers) are skipped.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

let webpSupport = null;
/** True if canvas.toBlob really produces WebP (Safari < 17 returns PNG instead). */
function canEncodeWebp() {
  if (webpSupport === null) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

const toBlob = (canvas, type, quality) => new Promise((r) => canvas.toBlob(r, type, quality));

/** "IMG_0001.JPG" → "IMG_0001.webp" */
function withExtension(name, ext) {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name) + '.' + ext;
}

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
  const webp = canEncodeWebp();
  // Without WebP, a PNG that doesn't need resizing gains nothing from a lossless re-encode.
  if (!webp && scale === 1 && file.type === 'image/png') {
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

  const blob = webp ? await toBlob(canvas, 'image/webp', WEBP_QUALITY) : await toBlob(canvas, file.type, FALLBACK_QUALITY);
  if (!blob || blob.size >= file.size) return file;

  if (blob.type === 'image/webp') {
    return new File([blob], withExtension(file.name, 'webp'), { type: 'image/webp', lastModified: file.lastModified });
  }
  // Same format as before: keep the original name and type.
  return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
}
