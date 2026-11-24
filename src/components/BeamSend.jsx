import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Film, ImagePlus, Laptop, Send, Smartphone, X } from 'lucide-react';
import { clearRoomFromUrl, connectBeam } from '../lib/beam';
import { findOrCreateRootFolder, friendlyError, getFolderPath, syncPoolAccounts } from '../lib/drive';
import { formatBytes, plural } from '../lib/format';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { useFlick } from '../hooks/useFlick';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './ui';

const ACTIVE = ['queued', 'preparing', 'uploading'];

/** Same "Original quality" preference the gallery uses (Upload ▾). */
function readOriginalPref() {
  try {
    return JSON.parse(localStorage.getItem('dg-original')) === true;
  } catch {
    return false;
  }
}

/**
 * Phone side of "Send from phone", opened from the laptop's QR code.
 * Pick photos with the system picker, then flick the phone (or tap Send):
 * the files upload straight to Drive and the laptop is told about each one.
 */
export default function BeamSend({ room, onExit }) {
  const { accountsKey } = useAuth();
  const [status, setStatus] = useState('connecting');
  const [laptop, setLaptop] = useState(false);
  const [target, setTarget] = useState(null); // { folderId, folderName } from the laptop
  const [picked, setPicked] = useState([]); // [{ key, file, url }]
  const [phase, setPhase] = useState('pick'); // pick | sending | sent
  const [error, setError] = useState(null);
  const conn = useRef(null);
  const inputRef = useRef(null);
  const batch = useRef(null); // { ids: Set<queue item id> }

  /* ---------- Pairing room ---------- */

  useEffect(() => {
    const c = connectBeam(room, 'phone', {
      onStatus: setStatus,
      onMessage: (m) => {
        if (m.type === 'peers') setLaptop(m.roles.includes('host'));
        else if (m.type === 'peer' && m.role === 'host') setLaptop(m.event === 'join');
        else if (m.type === 'target' && typeof m.folderId === 'string') {
          setLaptop(true);
          setTarget({ folderId: m.folderId, folderName: String(m.folderName || 'DriveGallery') });
        }
      },
    });
    conn.current = c;
    return () => c.close();
  }, [room]);

  // (Re)ask the laptop for its folder whenever the connection comes up.
  useEffect(() => {
    if (status === 'open') conn.current?.send({ type: 'hello' });
  }, [status]);

  // Linked accounts load after sign-in; bring the upload pool up to date.
  useEffect(() => {
    syncPoolAccounts().catch(() => {});
  }, [accountsKey]);

  /* ---------- Picking ---------- */

  const addPicked = (files) => {
    const next = [...files]
      .filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }));
    setPicked((p) => [...p, ...next]);
    setPhase('pick');
    setError(null);
  };
  const removePicked = (key) =>
    setPicked((p) => {
      const gone = p.find((x) => x.key === key);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.key !== key);
    });
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  /* ---------- Sending ---------- */

  const queue = useUploadQueue({
    onUploaded: (file, folderId) => conn.current?.send({ type: 'uploaded', id: file.id, folderId }),
    onError: (e, item) => {
      conn.current?.send({ type: 'failed', name: item.name });
      setError(friendlyError(e));
    },
  });

  // The batch is over once none of its items is still in flight.
  useEffect(() => {
    const b = batch.current;
    if (!b || phase !== 'sending') return;
    const mine = queue.items.filter((it) => b.ids.has(it.id));
    if (mine.length && mine.every((it) => !ACTIVE.includes(it.status))) {
      batch.current = null;
      conn.current?.send({ type: 'done' });
      const ok = mine.filter((it) => it.status === 'done').length;
      setPhase(ok ? 'sent' : 'pick');
      if (ok === mine.length) {
        pickedRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url));
        setPicked([]);
      }
      queue.clearFinished();
    }
  }, [queue.items, phase, queue]);

  const canSend = phase === 'pick' && picked.length > 0 && laptop && target && status === 'open';

  const send = useCallback(async () => {
    if (!canSend) return;
    setPhase('sending');
    setError(null);
    const files = picked.map((p) => p.file);
    conn.current?.send({ type: 'incoming', count: files.length });
    try {
      const root = await findOrCreateRootFolder();
      await syncPoolAccounts().catch(() => {});
      // Learn the laptop's folder (it may live in a linked account); fall back to the top folder.
      let folderId = root.id;
      if (target.folderId !== root.id) {
        const path = await getFolderPath(target.folderId, root.id).catch(() => null);
        if (path?.length) folderId = target.folderId;
      }
      batch.current = { ids: new Set(queue.addFiles(files, folderId, { compress: !readOriginalPref() })) };
    } catch (e) {
      setError(friendlyError(e));
      conn.current?.send({ type: 'done' });
      setPhase('pick');
    }
  }, [canSend, picked, target, queue]);

  const { motion: motionState, enable: enableMotion } = useFlick(send, { enabled: canSend });

  /* ---------- Progress ---------- */

  const progress = useMemo(() => {
    const b = batch.current;
    const mine = b ? queue.items.filter((it) => b.ids.has(it.id)) : [];
    const total = mine.reduce((s, it) => s + (it.total || 0), 0);
    const loaded = mine.reduce((s, it) => s + (it.status === 'done' ? it.total : it.loaded || 0), 0);
    return { n: mine.length, done: mine.filter((it) => it.status === 'done').length, pct: total ? loaded / total : 0 };
  }, [queue.items]);

  const bytes = picked.reduce((s, p) => s + p.file.size, 0);
  const exit = () => {
    clearRoomFromUrl();
    onExit();
  };

  /* ---------- UI ---------- */

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-page px-4 pb-safe pt-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
            <Smartphone className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h1 className="text-[19px] leading-tight">Send to laptop</h1>
            <p className="flex items-center gap-1.5 text-[13px] text-muted" role="status">
              <span className={`h-2 w-2 rounded-full ${laptop && status === 'open' ? 'bg-success' : status === 'error' ? 'bg-danger' : 'bg-track'}`} />
              {laptop && status === 'open'
                ? `Connected · into “${target?.folderName || '…'}”`
                : status === 'error'
                  ? 'Can’t reach the laptop'
                  : status === 'open'
                    ? 'Waiting for the laptop…'
                    : 'Connecting…'}
            </p>
          </div>
        </div>
        <button className="btn-ghost h-9 px-3 text-[14px]" onClick={exit}>
          Gallery
        </button>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          addPicked(e.target.files || []);
          e.target.value = '';
        }}
      />

      {/* Picked photos: they fly up and away when sent. */}
      <section className="mt-6 flex-1">
        {picked.length === 0 && phase !== 'sent' ? (
          <button
            className="flex h-56 w-full flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-hairline text-muted transition-colors active:bg-surface"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="h-8 w-8" strokeWidth={1.5} />
            <span className="text-[17px] font-medium text-ink">Choose photos</span>
            <span className="text-[14px]">From your gallery, as many as you like</span>
          </button>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[15px] font-medium">{phase === 'sent' && !picked.length ? 'Sent!' : `${plural(picked.length, 'item')} · ${formatBytes(bytes)}`}</p>
              {phase === 'pick' && (
                <button className="text-[15px] text-accent-link" onClick={() => inputRef.current?.click()}>
                  Add more
                </button>
              )}
            </div>
            <ul className="grid grid-cols-3 gap-1.5">
              <AnimatePresence>
                {picked.map((p, i) => (
                  <motion.li
                    key={p.key}
                    layout
                    className="relative aspect-square overflow-hidden rounded-xl bg-surface"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={phase === 'sending' ? { y: -900, scale: 0.4, rotate: (i % 3) * 6 - 6, opacity: 0 } : { opacity: 1, scale: 1, y: 0, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={phase === 'sending' ? { duration: 0.55, ease: [0.5, 0, 0.75, 0], delay: i * 0.04 } : { type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {p.url ? (
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted">
                        <Film className="h-6 w-6" />
                      </div>
                    )}
                    {phase === 'pick' && (
                      <button
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                        onClick={() => removePicked(p.key)}
                        aria-label={`Remove ${p.file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-[14px] text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </section>

      {/* Bottom: flick prompt, progress, or done. */}
      <section className="sticky bottom-0 -mx-4 mt-6 bg-page px-4 pb-5 pt-3">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'sending' ? (
            <motion.div key="sending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[20px] bg-surface p-4">
              <div className="flex items-center gap-2 text-[15px] font-medium">
                <Spinner className="h-4 w-4" /> Sending {progress.done} of {progress.n || picked.length}…
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
                <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.round(progress.pct * 100)}%` }} />
              </div>
            </motion.div>
          ) : phase === 'sent' && !picked.length ? (
            <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="text-[16px]">On your laptop now.</p>
              <button className="btn-primary h-12 w-full text-[16px]" onClick={() => (setPhase('pick'), inputRef.current?.click())}>
                Send more
              </button>
            </motion.div>
          ) : picked.length > 0 ? (
            <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
              {motionState === 'prompt' ? (
                <button className="btn-secondary h-12 w-full text-[16px]" onClick={enableMotion}>
                  Turn on flick to send
                </button>
              ) : motionState === 'granted' ? (
                <div className="flex items-center gap-3 py-1 text-[15px] text-muted">
                  <motion.span
                    animate={canSend ? { rotate: [0, -24, 0], y: [0, -6, 0] } : {}}
                    transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
                    className="origin-bottom"
                  >
                    <Smartphone className="h-6 w-6 text-accent" />
                  </motion.span>
                  {canSend ? 'Flick your phone toward the laptop' : 'Waiting for the laptop…'}
                  <Laptop className="h-6 w-6" />
                </div>
              ) : null}
              <button className="btn-primary h-12 w-full gap-2 text-[16px]" onClick={send} disabled={!canSend}>
                <Send className="h-4 w-4" /> Send {plural(picked.length, 'item')}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}
