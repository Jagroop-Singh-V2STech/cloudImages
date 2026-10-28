/**
 * Reference-counted cache of blob: URLs for thumbnails and full media.
 *
 * Components `acquire` a URL (fetching it once, even if several components ask
 * at the same time) and `release` it on unmount. When nothing references a URL
 * any more it's revoked after a short grace period, so re-sorting or paging
 * (which unmounts and remounts cards) doesn't refetch everything, while memory
 * is still reclaimed when the user moves on.
 */

const entries = new Map(); // key → { promise, url, refs, timer }
const GRACE_MS = 45_000;

// Throttle concurrent fetches so a big folder doesn't fire 200 requests at once.
const MAX_CONCURRENT = 6;
let active = 0;
const waiting = [];
function schedule(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          waiting.shift()?.();
        });
    };
    active < MAX_CONCURRENT ? run() : waiting.push(run);
  });
}

export function peek(key) {
  return entries.get(key)?.url || null;
}

/** loader: () => Promise<Blob|null>. Resolves to a blob URL or null. */
export function acquire(key, loader) {
  let e = entries.get(key);
  if (e) {
    clearTimeout(e.timer);
    e.refs++;
    return e.promise;
  }
  e = { refs: 1, url: null, timer: null };
  e.promise = schedule(loader).then(
    (blob) => {
      if (!blob) return null;
      e.url = URL.createObjectURL(blob);
      // Released while loading: start the revoke countdown now.
      if (e.refs <= 0) e.timer = setTimeout(() => revoke(key), GRACE_MS);
      return e.url;
    },
    (err) => {
      entries.delete(key); // allow a later retry
      throw err;
    },
  );
  entries.set(key, e);
  return e.promise;
}

export function release(key) {
  const e = entries.get(key);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    clearTimeout(e.timer);
    e.timer = setTimeout(() => revoke(key), GRACE_MS);
  }
}

function revoke(key) {
  const e = entries.get(key);
  if (!e || e.refs > 0) return;
  if (e.url) URL.revokeObjectURL(e.url);
  entries.delete(key);
}

/** Drop a file's cached media, e.g. after it's deleted. */
export function invalidate(fileId) {
  for (const key of [...entries.keys()]) {
    if (key.endsWith(':' + fileId)) {
      const e = entries.get(key);
      if (e.refs <= 0) revoke(key);
    }
  }
}

/** Revoke everything (sign out). */
export function clearAll() {
  for (const [, e] of entries) {
    clearTimeout(e.timer);
    if (e.url) URL.revokeObjectURL(e.url);
  }
  entries.clear();
}
