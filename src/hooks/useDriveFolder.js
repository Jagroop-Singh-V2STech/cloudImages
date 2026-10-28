import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, listFiles } from '../lib/drive';
import { isFolder, isImage, isVideo } from '../lib/format';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Mirrors the server's orderBy so locally inserted/renamed items land in the right spot. */
export function makeComparator(sort, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  return (a, b) => {
    const fa = isFolder(a);
    const fb = isFolder(b);
    if (fa !== fb) return fa ? -1 : 1;
    let c = 0;
    if (sort === 'date') c = new Date(a.modifiedTime) - new Date(b.modifiedTime);
    else if (sort === 'size') c = Number(a.quotaBytesUsed || a.size || 0) - Number(b.quotaBytesUsed || b.size || 0);
    if (c === 0) c = collator.compare(a.name, b.name);
    return c * dir;
  };
}

function matches(file, { folderId, search, filter }) {
  if (file.trashed) return false;
  if (search) {
    if (!file.name.toLowerCase().includes(search.toLowerCase())) return false;
  } else if (!file.parents?.includes(folderId)) return false;
  if (isFolder(file)) return true;
  if (filter === 'images') return isImage(file);
  if (filter === 'videos') return isVideo(file);
  return isImage(file) || isVideo(file);
}

/**
 * Paginated listing of a folder (or search results). Pages are fetched with
 * Drive's pageToken; `loadMore` appends the next page. The `add/patch/remove`
 * helpers update the list optimistically after uploads, renames and moves so
 * the UI doesn't need to refetch.
 */
export function useDriveFolder({ folderId, search = '', filter = 'all', sort = 'name', direction = 'asc', rootId }) {
  const [items, setItems] = useState([]);
  const [pageToken, setPageToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const req = useRef(0);
  const ctrl = useRef(null);
  const query = { folderId, search, filter, sort, direction };
  const queryRef = useRef(query);
  queryRef.current = query;

  const clean = useCallback((files) => (files || []).filter((f) => f.id !== rootId), [rootId]);

  const load = useCallback(async () => {
    if (!folderId) return;
    const id = ++req.current;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const data = await listFiles({ folderId, search, filter, sort, direction, signal: ctrl.current.signal });
      if (id !== req.current) return;
      setItems(clean(data.files).sort(makeComparator(sort, direction)));
      setPageToken(data.nextPageToken || null);
    } catch (e) {
      if (id !== req.current || isAbortError(e)) return;
      setError(e);
      setItems([]);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [folderId, search, filter, sort, direction, clean]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!pageToken || loadingMore || loading) return;
    const id = req.current;
    setLoadingMore(true);
    try {
      const data = await listFiles({ folderId, search, filter, sort, direction, pageToken });
      if (id !== req.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        return [...prev, ...clean(data.files).filter((f) => !seen.has(f.id))];
      });
      setPageToken(data.nextPageToken || null);
    } catch (e) {
      if (id === req.current) setError(e);
    } finally {
      if (id === req.current) setLoadingMore(false);
    }
  }, [pageToken, loadingMore, loading, folderId, search, filter, sort, direction, clean]);

  /** Insert or replace items that belong in the current view. */
  const add = useCallback((files) => {
    const q = queryRef.current;
    const list = (Array.isArray(files) ? files : [files]).filter((f) => matches(f, q));
    if (!list.length) return;
    setItems((prev) => {
      const ids = new Set(list.map((f) => f.id));
      return [...prev.filter((f) => !ids.has(f.id)), ...list].sort(makeComparator(q.sort, q.direction));
    });
  }, []);

  const patch = useCallback((id, changes) => {
    const q = queryRef.current;
    setItems((prev) =>
      prev
        .map((f) => (f.id === id ? { ...f, ...changes } : f))
        .filter((f) => f.id !== id || matches(f, q))
        .sort(makeComparator(q.sort, q.direction)),
    );
  }, []);

  const remove = useCallback((ids) => {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    setItems((prev) => prev.filter((f) => !set.has(f.id)));
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(pageToken),
    loadMore,
    refresh: load,
    add,
    patch,
    remove,
  };
}
