import { useEffect, useRef, useState } from 'react';
import { acquire, peek, release } from '../lib/mediaCache';
import { downloadFile, fetchThumbnail, getFile } from '../lib/drive';

/*
 * Drive's thumbnailLink for a private file must be a *credentialed* request
 * (the user's Google cookies). fetch() can't do that here: without cookies it
 * is refused, and with an Authorization header the CORS preflight is rejected.
 * A plain <img> load does send the cookies, so we verify the link by loading it
 * as an image and then render that URL directly (the browser cache serves it).
 */
const directUrls = new Map(); // cache key -> verified thumbnail URL

const sized = (link, size) => link.replace(/=s\d+(-c)?$/, `=s${size}`);

function loadsAsImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/** A working thumbnail URL for `file`, or null if Drive has none we can load. */
async function directThumbnail(file, size) {
  if (file.thumbnailLink && (await loadsAsImage(sized(file.thumbnailLink, size)))) return sized(file.thumbnailLink, size);
  // The link is short-lived, and videos only get one after Drive finishes
  // processing, so ask Drive for fresh metadata once before giving up.
  try {
    const fresh = await getFile(file.id);
    if (fresh.thumbnailLink && fresh.thumbnailLink !== file.thumbnailLink && (await loadsAsImage(sized(fresh.thumbnailLink, size)))) {
      return sized(fresh.thumbnailLink, size);
    }
  } catch {
    /* fall through to the blob path */
  }
  return null;
}

/**
 * Lazily load a Drive thumbnail once the element scrolls near the viewport:
 * the thumbnail link itself when the browser can load it, otherwise a blob URL.
 * Returns [ref, url, state] where state is loading | ready | none | error.
 */
export function useThumbnail(file, { size = 480, enabled = true } = {}) {
  const ref = useRef(null);
  const key = file ? `thumb${size}:${file.id}` : null;
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState(() => (key ? directUrls.get(key) || peek(key) : null));
  const [state, setState] = useState(url ? 'ready' : 'loading');

  useEffect(() => {
    if (!enabled || visible || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, visible]);

  useEffect(() => {
    if (!visible || !key) return;
    let alive = true;
    let acquired = false;
    (async () => {
      const direct = directUrls.get(key) || (await directThumbnail(file, size));
      if (!alive) return;
      if (direct) {
        directUrls.set(key, direct);
        setUrl(direct);
        setState('ready');
        return;
      }
      // Fallback: the original blob path (small images download in full).
      acquired = true;
      try {
        const u = await acquire(key, () => fetchThumbnail(file, { size }));
        if (!alive) return;
        setUrl(u);
        setState(u ? 'ready' : 'none');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
      if (acquired) release(key);
    };
    // Re-fetch only when the file (or its thumbnail) actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, key, file?.thumbnailLink]);

  return [ref, url, state];
}

/** Full-resolution media as a blob URL, with download progress (0–1). */
export function useFullMedia(file) {
  const key = file ? `full:${file.id}` : null;
  const [url, setUrl] = useState(() => (key ? peek(key) : null));
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setUrl(peek(key));
    setError(null);
    setProgress(0);
    acquire(key, () =>
      downloadFile(file.id, {
        sizeHint: file.size,
        onProgress: (l, t) => alive && t && setProgress(l / t),
      }),
    )
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
      release(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { url, progress, error };
}
