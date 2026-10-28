import { forwardRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Film, Folder, ImageIcon, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { DRAG_TYPE, readDragIds, writeDragIds } from '../lib/dnd';
import { formatBytes, formatDate, isFolder, isVideo } from '../lib/format';
import { Checkbox } from './ui';
import MediaThumb from './MediaThumb';

// forwardRef: AnimatePresence mode="popLayout" measures exiting rows via ref.
const Row = forwardRef(function Row({ item, index, ctx }, ref) {
  const [over, setOver] = useState(false);
  const folder = isFolder(item);
  const selected = ctx.isSelected(item.id);
  const kind = folder ? 'Folder' : isVideo(item) ? 'Video' : 'Image';

  const dropProps = folder
    ? {
        onDragOver: (e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e) => {
          setOver(false);
          const ids = readDragIds(e);
          if (ids) {
            e.preventDefault();
            ctx.onDropOnFolder(item, ids);
          }
        },
      }
    : {};

  return (
    <motion.div
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 20) * 0.015 } }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
    >
      <div
        draggable
        onDragStart={(e) => writeDragIds(e, ctx.dragIdsFor(item), item.name)}
        {...dropProps}
        onClick={(e) => ctx.onItemClick(item, e)}
        onDoubleClick={() => folder && ctx.onOpen(item)}
        onContextMenu={(e) => ctx.onContextMenu(item, e)}
        onKeyDown={(e) => e.key === 'Enter' && ctx.onOpen(item)}
        tabIndex={0}
        data-item-id={item.id}
        className={`group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-2 transition-colors last:border-0 sm:grid-cols-[auto_1fr_90px_90px_140px_auto] dark:border-white/5 ${
          over
            ? 'bg-brand-100 dark:bg-brand-500/20'
            : selected
              ? 'bg-brand-50 dark:bg-brand-500/10'
              : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
        }`}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selected}
            onChange={(e) => ctx.onToggle(item, e)}
            className={selected || ctx.selectionMode ? '' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}
            label={`Select ${item.name}`}
          />
          {folder ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300">
              <Folder className="h-5 w-5" fill="currentColor" fillOpacity={0.25} />
            </div>
          ) : (
            <MediaThumb file={item} size={120} className="h-10 w-10 rounded-lg" iconSize="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-slate-500 sm:hidden dark:text-slate-400">
            {folder ? 'Folder' : formatBytes(item.size)} · {formatDate(item.modifiedTime)}
          </p>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex dark:text-slate-400">
          {folder ? <Folder className="h-3.5 w-3.5" /> : isVideo(item) ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
          {kind}
        </span>
        <span className="hidden text-sm tabular-nums text-slate-500 sm:block dark:text-slate-400">{folder ? '—' : formatBytes(item.size)}</span>
        <span className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">{formatDate(item.modifiedTime)}</span>
        <div className="flex items-center gap-0.5">
          <div className="hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 md:flex">
            {!folder && (
              <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onAction('download', item))} aria-label="Download">
                <Download className="h-4 w-4" />
              </button>
            )}
            <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onAction('rename', item))} aria-label="Rename">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="icon-btn h-8 w-8 hover:!text-red-600" onClick={(e) => (e.stopPropagation(), ctx.onAction('delete', item))} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onContextMenu(item, e))} aria-label="More actions">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

/** List view: a compact table with name, type, size and modified date. */
export default function FileList({ items, ctx, allSelected, someSelected, onSelectAll }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200/80 dark:bg-white/[0.03] dark:ring-white/[0.07]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:grid-cols-[auto_1fr_90px_90px_140px_auto] dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-slate-400">
        <div className="flex items-center gap-3">
          <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={onSelectAll} label="Select all" />
          <span className="w-10" />
        </div>
        <span>Name</span>
        <span className="hidden sm:block">Type</span>
        <span className="hidden sm:block">Size</span>
        <span className="hidden sm:block">Modified</span>
        <span className="w-8" />
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, i) => (
          <Row key={item.id} item={item} index={i} ctx={ctx} />
        ))}
      </AnimatePresence>
    </div>
  );
}
