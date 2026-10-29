import { motion } from 'framer-motion';
import { Film, ImageIcon, ImageOff } from 'lucide-react';
import { useThumbnail } from '../hooks/useMediaUrl';
import { isVideo } from '../lib/format';

/** Soft muted placeholder tones; theme-aware via --tone-* in index.css. */
export const TONES = [0, 1, 2, 3, 4].map((i) => `rgb(var(--tone-${i}))`);

/** Stable tone per file so a tile keeps its colour across renders. */
export function toneFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

/**
 * Thumbnail loaded lazily through an authenticated blob URL. The <img> carries
 * a layoutId so the Lightbox can animate from it (shared-element transition).
 */
export default function MediaThumb({ file, size = 480, className = '', layoutId, iconSize = 'h-7 w-7' }) {
  const [ref, url, state] = useThumbnail(file, { size });
  const Fallback = state === 'error' ? ImageOff : isVideo(file) ? Film : ImageIcon;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={{ backgroundColor: toneFor(file.id) }}>
      {state === 'loading' && <div className="skeleton absolute inset-0 !bg-transparent" aria-hidden />}
      {url ? (
        <motion.img
          layoutId={layoutId}
          src={url}
          alt={file.name}
          draggable={false}
          className="h-full w-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ opacity: { duration: 0.35 } }}
        />
      ) : (
        state !== 'loading' && (
          <div className="flex h-full w-full items-center justify-center text-ink/30">
            <Fallback className={iconSize} strokeWidth={1.5} aria-hidden />
          </div>
        )
      )}
    </div>
  );
}
