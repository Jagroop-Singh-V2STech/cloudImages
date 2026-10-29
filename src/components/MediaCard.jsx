import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Heart, MoreHorizontal } from 'lucide-react';
import { writeDragIds } from '../lib/dnd';
import { formatDuration, isVideo } from '../lib/format';
import { gridItem, tileHover } from '../lib/motion';
import { Checkbox } from './ui';
import MediaThumb from './MediaThumb';

// forwardRef: AnimatePresence mode="popLayout" measures exiting tiles via ref.
const MediaCard = forwardRef(function MediaCard({ file, index, ctx }, ref) {
  const selected = ctx.isSelected(file.id);
  const favorite = ctx.isFavorite?.(file.id);
  const video = isVideo(file);
  const duration = video && formatDuration(file.videoMediaMetadata?.durationMillis);
  // Controls stay visible on touch screens; the name scrim only appears on hover/focus.
  const hoverOnly = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100';
  const reveal = `${hoverOnly} [@media(hover:none)]:opacity-100`;

  return (
    <motion.div ref={ref} layout="position" variants={gridItem} custom={index} initial="initial" animate="animate" exit="exit">
      <motion.div whileHover={tileHover} className="rounded-tile">
        <div
          draggable
          onDragStart={(e) => writeDragIds(e, ctx.dragIdsFor(file), file.name)}
          onClick={(e) => ctx.onItemClick(file, e)}
          onContextMenu={(e) => ctx.onContextMenu(file, e)}
          onKeyDown={(e) => e.key === 'Enter' && ctx.onOpen(file)}
          tabIndex={0}
          aria-label={`${video ? 'Video' : 'Photo'}: ${file.name}`}
          data-item-id={file.id}
          className={`group relative h-[190px] cursor-pointer overflow-hidden rounded-tile ${selected ? 'ring-[3px] ring-accent ring-offset-2 ring-offset-page' : ''}`}
        >
          <MediaThumb file={file} layoutId={`media-${file.id}`} className="h-full w-full" />

          {/* Hover scrim, name and actions */}
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/10 transition-opacity duration-200 ${hoverOnly}`} />
          <p className={`pointer-events-none absolute inset-x-3 bottom-3 truncate text-[13px] font-medium text-white transition-opacity duration-200 ${video ? 'pl-14' : ''} ${hoverOnly}`}>
            {file.name}
          </p>
          <div className={`absolute left-3 top-3 transition-opacity ${selected || ctx.selectionMode ? 'opacity-100' : reveal}`}>
            <Checkbox checked={selected} onChange={(e) => ctx.onToggle(file, e)} label={`Select ${file.name}`} />
          </div>
          <button
            className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-card/85 text-ink backdrop-blur transition-opacity hover:bg-card ${reveal}`}
            onClick={(e) => {
              e.stopPropagation();
              ctx.onContextMenu(file, e);
            }}
            aria-label={`More actions for ${file.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {favorite && (
            <Heart className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-white drop-shadow" fill="currentColor" aria-label="Favorite" />
          )}

          {video && (
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-white backdrop-blur">
              {duration || 'Video'}
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});

export default MediaCard;
