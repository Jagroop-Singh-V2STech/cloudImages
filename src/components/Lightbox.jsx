import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ChevronLeft, ChevronRight, Download, ExternalLink, Heart, Minus, Plus, X } from 'lucide-react';
import { useFullMedia, useThumbnail } from '../hooks/useMediaUrl';
import { formatBytes, isImage, isVideo } from '../lib/format';
import { friendlyError } from '../lib/drive';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const PREFETCH_LIMIT = 25 * 1024 * 1024;

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/** Fit (w × h) inside (maxW × maxH), never upscaling past the natural size by more than 2×. */
function fit(w, h, maxW, maxH) {
  if (!w || !h) return { width: Math.min(maxW, 900), height: Math.min(maxH, 600) };
  const s = Math.min(maxW / w, maxH / h, 2);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

function LoadingRing({ progress }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card/80 px-4 py-3 text-ink shadow-pill backdrop-blur">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
        <motion.circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - (progress || 0.03)) }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      </svg>
      <span className="text-xs tabular-nums">{Math.round((progress || 0) * 100)}%</span>
    </div>
  );
}

/** Warm the cache for the next/previous image so navigation feels instant. */
function Prefetch({ file }) {
  useFullMedia(file);
  return null;
}

function ImageStage({ file, shared, zoom, setZoom, box }) {
  const [thumbRef, thumbUrl] = useThumbnail(file);
  const { url, progress, error } = useFullMedia(file);
  const [natural, setNatural] = useState(() =>
    file.imageMediaMetadata?.width ? { w: file.imageMediaMetadata.width, h: file.imageMediaMetadata.height } : null,
  );
  const size = fit(natural?.w, natural?.h, box.w, box.h);

  return (
    <div ref={thumbRef} className="relative flex items-center justify-center" style={size}>
      <motion.div
        className="relative h-full w-full"
        animate={{ scale: zoom }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag={zoom > 1}
        dragConstraints={{
          left: (-size.width * (zoom - 1)) / 2,
          right: (size.width * (zoom - 1)) / 2,
          top: (-size.height * (zoom - 1)) / 2,
          bottom: (size.height * (zoom - 1)) / 2,
        }}
        dragElastic={0.15}
        onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
        style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
      >
        {thumbUrl && (
          <motion.img
            layoutId={shared ? `media-${file.id}` : undefined}
            src={thumbUrl}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={(e) => !natural && setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute inset-0 h-full w-full rounded-tile object-contain"
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          />
        )}
        {url && (
          <motion.img
            src={url}
            alt={file.name}
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute inset-0 h-full w-full select-none rounded-tile object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </motion.div>
      {!url && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {!thumbUrl ? <LoadingRing progress={progress} /> : progress > 0 && progress < 1 && <div className="absolute bottom-3"><LoadingRing progress={progress} /></div>}
        </div>
      )}
      {error && <StageError error={error} />}
    </div>
  );
}

function VideoStage({ file, shared, box }) {
  const [thumbRef, thumbUrl] = useThumbnail(file);
  const { url, progress, error } = useFullMedia(file);
  const meta = file.videoMediaMetadata;
  const size = fit(meta?.width || 1280, meta?.height || 720, box.w, box.h);

  return (
    <div ref={thumbRef} className="relative flex items-center justify-center" style={size}>
      {url ? (
        <video src={url} controls autoPlay playsInline className="h-full w-full rounded-tile bg-black object-contain" />
      ) : (
        <>
          {thumbUrl && (
            <motion.img
              layoutId={shared ? `media-${file.id}` : undefined}
              src={thumbUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full rounded-tile object-contain opacity-60"
            />
          )}
          {!error && (
            <div className="relative flex flex-col items-center gap-2">
              <LoadingRing progress={progress} />
              <span className="text-[13px] text-muted">Loading video · {formatBytes(file.size)}</span>
            </div>
          )}
          {error && <StageError error={error} />}
        </>
      )}
    </div>
  );
}

function StageError({ error }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-[14px] text-ink shadow-float">
        <AlertCircle className="h-4 w-4 text-danger" /> {friendlyError(error)}
      </div>
    </div>
  );
}

/**
 * Fullscreen viewer. Navigation: ←/→, swipe, or the side buttons.
 * Images: zoom with +/−, mouse wheel or double-click; drag to pan when zoomed.
 */
export default function Lightbox({ items, index, originId, onIndexChange, onClose, onDownload, isFavorite, onToggleFavorite, hasMore, onLoadMore }) {
  const file = items[index];
  const [zoom, setZoom] = useState(1);
  const [dir, setDir] = useState(0);
  const [chrome, setChrome] = useState(true);
  const reduce = useReducedMotion();
  const vp = useViewport();
  const box = useMemo(() => ({ w: vp.w - (vp.w < 640 ? 16 : 160), h: vp.h - 140 }), [vp]);

  const go = useCallback(
    (delta) => {
      const next = index + delta;
      if (next < 0 || next >= items.length) return;
      setDir(delta);
      setZoom(1);
      onIndexChange(next);
      // Near the end of what's loaded: fetch the next page in the background.
      if (hasMore && next >= items.length - 3) onLoadMore?.();
    },
    [index, items.length, onIndexChange, hasMore, onLoadMore],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if ((e.key === '+' || e.key === '=') && isImage(file)) setZoom((z) => Math.min(MAX_ZOOM, z + 0.5));
      else if (e.key === '-' && isImage(file)) setZoom((z) => Math.max(MIN_ZOOM, z - 0.5));
      else if (e.key === '0') setZoom(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose, file]);

  // Lock page scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // The item was deleted/moved out from under us.
  useEffect(() => {
    if (!file) onClose();
  }, [file, onClose]);
  if (!file) return null;

  const neighbors = [items[index + 1], items[index - 1]].filter((f) => f && isImage(f) && Number(f.size || 0) < PREFETCH_LIMIT);
  const shared = file.id === originId && !reduce;

  const onWheel = (e) => {
    if (!isImage(file)) return;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.0025)));
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col bg-page/90 text-ink backdrop-blur-2xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      {/* Top bar */}
      <motion.div
        className="relative z-10 flex h-16 shrink-0 items-center gap-1.5 px-3 sm:px-6"
        animate={{ opacity: chrome ? 1 : 0, y: chrome ? 0 : -10 }}
      >
        <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface" onClick={onClose} aria-label="Close (Esc)">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{file.name}</p>
          <p className="text-[13px] text-muted">
            {index + 1} of {items.length}
            {hasMore ? '+' : ''} · {formatBytes(file.size)}
          </p>
        </div>
        {isImage(file) && (
          <div className="mr-1 hidden items-center gap-1 rounded-full bg-surface p-1 sm:flex">
            <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-card disabled:opacity-30" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.5))} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
              <Minus className="h-4 w-4" />
            </button>
            <button className="w-12 text-center text-[13px] tabular-nums" onClick={() => setZoom(1)} title="Reset zoom" aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-card disabled:opacity-30" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
        {onToggleFavorite && (
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface"
            onClick={() => onToggleFavorite(file)}
            aria-label={isFavorite?.(file.id) ? 'Remove from Favorites' : 'Add to Favorites'}
            aria-pressed={Boolean(isFavorite?.(file.id))}
            title={isFavorite?.(file.id) ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Heart className={`h-5 w-5 ${isFavorite?.(file.id) ? 'text-[#ff2d55]' : ''}`} fill={isFavorite?.(file.id) ? 'currentColor' : 'none'} />
          </button>
        )}
        <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface" onClick={() => onDownload(file)} aria-label="Download" title="Download">
          <Download className="h-5 w-5" />
        </button>
        {file.webViewLink && (
          <a className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface" href={file.webViewLink} target="_blank" rel="noreferrer" aria-label="Open in Google Drive" title="Open in Google Drive">
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </motion.div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden" onWheel={onWheel} onClick={(e) => e.target === e.currentTarget && setChrome((c) => !c)}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={file.id}
            custom={dir}
            variants={{
              enter: (d) => ({ x: d * 120, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d) => ({ x: d * -120, opacity: 0 }),
            }}
            initial={dir ? 'enter' : false}
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 350, damping: 35 }, opacity: { duration: 0.2 } }}
            // Swipe to navigate (disabled while zoomed so dragging pans instead).
            drag={zoom === 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              const swipe = info.offset.x + info.velocity.x * 0.2;
              if (swipe < -90) go(1);
              else if (swipe > 90) go(-1);
            }}
            className="flex items-center justify-center"
          >
            {isVideo(file) ? <VideoStage file={file} shared={shared} box={box} /> : <ImageStage file={file} shared={shared} zoom={zoom} setZoom={setZoom} box={box} />}
          </motion.div>
        </AnimatePresence>

        {index > 0 && (
          <button
            className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-pill transition hover:scale-105 sm:flex"
            onClick={() => go(-1)}
            aria-label="Previous (←)"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-pill transition hover:scale-105 sm:flex"
            onClick={() => go(1)}
            aria-label="Next (→)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {neighbors.map((f) => (
        <Prefetch key={f.id} file={f} />
      ))}
    </motion.div>,
    document.body,
  );
}
