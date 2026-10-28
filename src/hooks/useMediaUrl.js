import { useEffect, useRef, useState } from 'react';
import { acquire, peek, release } from '../lib/mediaCache';
import { downloadFile, fetchThumbnail } from '../lib/drive';

/**
 * Lazily load a Drive thumbnail as a blob URL once the element scrolls near the
 * viewport. Returns [ref, url, state] where state is loading | ready | none | error.
 */
export function useThumbnail(file, { size = 480, enabled = true } = {}) {
  const ref = useRef(null);
  const key = file ? `thumb${size}:${file.id}` : null;
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState(() => (key ? peek(key) : null));
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
    acquire(key, () => fetchThumbnail(file, { size }))
      .then((u) => {
        if (!alive) return;
        setUrl(u);
        setState(u ? 'ready' : 'none');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
      release(key);
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
