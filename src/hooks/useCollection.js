import { useCallback, useEffect, useRef, useState } from 'react';
import { getFile, isAbortError } from '../lib/drive';

function readIds(key) {
  try {
    const v = JSON.parse(localStorage.getItem('dg-' + key));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * A per-browser list of file ids (Recents, Favorites), newest first. Only ids
 * are stored; `items` are fetched fresh from Drive while `active` is true so
 * names, thumbnails and trash state are always current.
 */
export function useCollection(key, { max = 200, active = false } = {}) {
  const [ids, setIds] = useState(() => readIds(key));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    try {
      localStorage.setItem('dg-' + key, JSON.stringify(ids));
    } catch {
      /* storage unavailable */
    }
  }, [key, ids]);

  const load = useCallback(async () => {
    const list = idsRef.current;
    setLoading(true);
    const results = await Promise.allSettled(list.map((id) => getFile(id)));
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    // Drop ids that no longer resolve (deleted elsewhere).
    const gone = results.some((r) => r.status === 'rejected' && !isAbortError(r.reason) && [403, 404].includes(r.reason?.status));
    if (gone) {
      const alive = new Set(ok.map((f) => f.id));
      setIds((prev) => prev.filter((id) => alive.has(id) || !list.includes(id)));
    }
    setItems(ok);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const has = useCallback((id) => ids.includes(id), [ids]);

  /** Put files at the front of the list. */
  const add = useCallback(
    (files) => {
      const list = Array.isArray(files) ? files : [files];
      const fresh = new Set(list.map((f) => f.id));
      setIds((prev) => [...list.map((f) => f.id), ...prev.filter((id) => !fresh.has(id))].slice(0, max));
      setItems((prev) => [...list, ...prev.filter((f) => !fresh.has(f.id))].slice(0, max));
    },
    [max],
  );

  const remove = useCallback((removeIds) => {
    const set = new Set(Array.isArray(removeIds) ? removeIds : [removeIds]);
    setIds((prev) => prev.filter((id) => !set.has(id)));
    setItems((prev) => prev.filter((f) => !set.has(f.id)));
  }, []);

  const toggle = useCallback((file) => (idsRef.current.includes(file.id) ? remove(file.id) : add(file)), [add, remove]);

  const patch = useCallback((id, changes) => {
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)));
  }, []);

  return { ids, items, loading, has, add, remove, toggle, patch, refresh: load };
}
