import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Download, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react';
import { writeDragIds } from '../lib/dnd';
import { formatBytes, formatDate, formatDuration, isVideo } from '../lib/format';
import { gridItem } from '../lib/motion';
import { Checkbox } from './ui';
import MediaThumb from './MediaThumb';

function OverlayButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900 ${
        danger ? 'hover:text-red-600 dark:hover:text-red-400' : ''
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// forwardRef: AnimatePresence mode="popLayout" measures exiting cards via ref.
const MediaCard = forwardRef(function MediaCard({ file, index, ctx }, ref) {
  const selected = ctx.isSelected(file.id);
  const video = isVideo(file);
  const duration = video && formatDuration(file.videoMediaMetadata?.durationMillis);

  return (
    <motion.div ref={ref} layout="position" variants={gridItem} custom={index} initial="initial" animate="animate" exit="exit">
      <div
        draggable
        onDragStart={(e) => writeDragIds(e, ctx.dragIdsFor(file), file.name)}
        onClick={(e) => ctx.onItemClick(file, e)}
        onContextMenu={(e) => ctx.onContextMenu(file, e)}
        onKeyDown={(e) => e.key === 'Enter' && ctx.onOpen(file)}
        tabIndex={0}
        data-item-id={file.id}
        className={`group relative cursor-pointer overflow-hidden rounded-2xl ring-1 transition-all duration-200 hover:-translate-y-1 hover:shadow-lift ${
          selected
            ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/10'
            : 'bg-white ring-slate-200/80 shadow-card dark:bg-white/[0.04] dark:ring-white/[0.07]'
        }`}
      >
        <div className={`relative aspect-square overflow-hidden transition-[padding] duration-200 ${selected ? 'p-2' : ''}`}>
          <MediaThumb
            file={file}
            layoutId={`media-${file.id}`}
            className={`h-full w-full transition-[border-radius] ${selected ? 'rounded-xl' : ''}`}
          />

          {/* Hover gradient + quick actions */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          <div className="absolute right-2 top-2 flex translate-y-[-4px] gap-1.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <OverlayButton icon={Download} label="Download" onClick={() => ctx.onAction('download', file)} />
            <OverlayButton icon={Pencil} label="Rename" onClick={() => ctx.onAction('rename', file)} />
            <OverlayButton icon={Trash2} label="Delete" danger onClick={() => ctx.onAction('delete', file)} />
          </div>
          <div className={`absolute left-2 top-2 transition-opacity ${selected || ctx.selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}>
            <Checkbox checked={selected} onChange={(e) => ctx.onToggle(file, e)} label={`Select ${file.name}`} />
          </div>

          {video && (
            <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <Play className="h-3 w-3" fill="currentColor" />
              {duration || 'Video'}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {formatBytes(file.size)} · {formatDate(file.modifiedTime)}
            </p>
          </div>
          <button
            className="icon-btn -mr-1 h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              ctx.onContextMenu(file, e);
            }}
            aria-label="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

export default MediaCard;
