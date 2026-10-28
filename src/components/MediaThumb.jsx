import { motion } from 'framer-motion';
import { Film, ImageIcon, ImageOff } from 'lucide-react';
import { useThumbnail } from '../hooks/useMediaUrl';
import { isVideo } from '../lib/format';

/**
 * Thumbnail loaded through an authenticated blob URL. The <img> carries a
 * layoutId so the Lightbox can animate from it (shared-element transition).
 */
export default function MediaThumb({ file, size = 480, className = '', layoutId, iconSize = 'h-8 w-8' }) {
  const [ref, url, state] = useThumbnail(file, { size });
  const Fallback = state === 'error' ? ImageOff : isVideo(file) ? Film : ImageIcon;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      {state === 'loading' && <div className="skeleton absolute inset-0" />}
      {url ? (
        <motion.img
          layoutId={layoutId}
          src={url}
          alt={file.name}
          draggable={false}
          className="h-full w-full object-cover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ opacity: { duration: 0.3 } }}
        />
      ) : (
        state !== 'loading' && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 dark:from-white/5 dark:to-white/[0.02] dark:text-slate-500">
            <Fallback className={iconSize} strokeWidth={1.5} />
          </div>
        )
      )}
    </div>
  );
}
