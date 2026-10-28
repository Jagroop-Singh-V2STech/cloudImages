import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, RESUMABLE_THRESHOLD, uploadResumable, uploadSimple } from '../lib/drive';
import { compressImage } from '../lib/compress';

const MAX_CONCURRENT = 3;
const PROGRESS_THROTTLE_MS = 120;
let seq = 0;

/**
 * Upload queue with at most three concurrent uploads.
 *
 * Item shape (rendered by UploadPanel):
 *   { id, name, size, type, folderId, status, loaded, total, speed, error, errorReason }
 *   status: queued → preparing → uploading → done | error | canceled
 *
 * Non-serialisable bits (File, AbortController, resumable session URI) live in
 * a ref so a retry of a resumable upload continues from where Drive left off.
 */
export function useUploadQueue({ onUploaded, onError } = {}) {
  const [items, setItems] = useState([]);
  const jobs = useRef(new Map()); // id → { file, controller, sessionUri, compress }
  const running = useRef(new Set());
  const callbacks = useRef({ onUploaded, onError });
  callbacks.current = { onUploaded, onError };

  const patch = useCallback((id, changes) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const addFiles = useCallback((files, folderId, { compress = false } = {}) => {
    const added = [...files].map((file) => {
      const id = `u${++seq}`;
      jobs.current.set(id, { file, compress, sessionUri: null });
      return {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        folderId,
        status: 'queued',
        loaded: 0,
        total: file.size,
        speed: 0,
        error: null,
      };
    });
    setItems((list) => [...list, ...added]);
    return added.length;
  }, []);

  const start = useCallback(
    async (item) => {
      const job = jobs.current.get(item.id);
      if (!job) return;
      running.current.add(item.id);
      job.controller = new AbortController();
      const { signal } = job.controller;

      try {
        let file = job.file;
        if (job.compress && file.type.startsWith('image/') && !job.sessionUri) {
          patch(item.id, { status: 'preparing' });
          file = await compressImage(file);
          job.prepared = file;
        } else if (job.prepared) {
          file = job.prepared;
        }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        patch(item.id, { status: 'uploading', total: file.size, size: file.size, error: null });

        // Speed = exponential moving average of bytes/second between progress events.
        let lastT = performance.now();
        let lastLoaded = 0;
        let speed = 0;
        let lastFlush = 0;
        const onProgress = (loaded, total) => {
          const now = performance.now();
          const dt = (now - lastT) / 1000;
          if (dt > 0.05) {
            const inst = Math.max(0, loaded - lastLoaded) / dt;
            speed = speed ? speed * 0.7 + inst * 0.3 : inst;
            lastT = now;
            lastLoaded = loaded;
          }
          if (now - lastFlush > PROGRESS_THROTTLE_MS || loaded >= total) {
            lastFlush = now;
            patch(item.id, { loaded, total, speed });
          }
        };

        const opts = {
          file,
          name: job.file.name, // preserve the original filename + extension
          mimeType: file.type || 'application/octet-stream',
          parentId: item.folderId,
          signal,
          onProgress,
        };
        const useResumable = file.type.startsWith('video/') || file.size > RESUMABLE_THRESHOLD;
        const result = useResumable
          ? await uploadResumable({ ...opts, sessionUri: job.sessionUri, onSession: (uri) => (job.sessionUri = uri) })
          : await uploadSimple(opts);

        patch(item.id, { status: 'done', loaded: file.size, speed: 0 });
        jobs.current.delete(item.id);
        callbacks.current.onUploaded?.(result, item.folderId);
      } catch (e) {
        if (isAbortError(e) || signal.aborted) {
          patch(item.id, { status: 'canceled', speed: 0 });
        } else {
          patch(item.id, { status: 'error', speed: 0, error: e.message, errorReason: e.reason });
          callbacks.current.onError?.(e, item);
        }
      } finally {
        running.current.delete(item.id);
        // Trigger the scheduler effect even if no item state changed.
        setItems((l) => [...l]);
      }
    },
    [patch],
  );

  // Scheduler: fill free slots with queued items, oldest first.
  useEffect(() => {
    const free = MAX_CONCURRENT - running.current.size;
    if (free <= 0) return;
    items
      .filter((it) => it.status === 'queued' && !running.current.has(it.id))
      .slice(0, free)
      .forEach((it) => start(it));
  }, [items, start]);

  const cancel = useCallback(
    (id) => {
      const job = jobs.current.get(id);
      if (job?.controller && running.current.has(id)) job.controller.abort();
      else patch(id, { status: 'canceled' });
    },
    [patch],
  );

  const retry = useCallback(
    (id) => {
      if (!jobs.current.has(id)) return;
      patch(id, { status: 'queued', error: null, errorReason: null });
    },
    [patch],
  );

  const cancelAll = useCallback(() => {
    items.forEach((it) => ['queued', 'preparing', 'uploading'].includes(it.status) && cancel(it.id));
  }, [items, cancel]);

  const clearFinished = useCallback(() => {
    setItems((list) => {
      const keep = list.filter((it) => ['queued', 'preparing', 'uploading'].includes(it.status));
      list.forEach((it) => !keep.includes(it) && jobs.current.delete(it.id));
      return keep;
    });
  }, []);

  const active = items.filter((it) => ['queued', 'preparing', 'uploading'].includes(it.status)).length;
  return { items, active, addFiles, cancel, retry, cancelAll, clearFinished };
}
