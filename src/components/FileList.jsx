import { forwardRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Film, Folder, ImageIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
        className={`group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl px-3 py-2 transition-colors sm:grid-cols-[auto_1fr_90px_90px_140px_auto] ${
          over ? 'bg-accent-soft ring-2 ring-accent' : selected ? 'bg-accent-soft' : 'hover:bg-surface'
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-muted group-hover:bg-card">
              <Folder className="h-5 w-5" strokeWidth={1.75} />
            </div>
          ) : (
            <MediaThumb file={item} size={120} className="h-12 w-12 rounded-xl" iconSize="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] text-ink">{item.name}</p>
          <p className="truncate text-[13px] text-muted sm:hidden">
            {folder ? 'Folder' : formatBytes(item.size)} · {formatDate(item.modifiedTime)}
          </p>
        </div>
        <span className="hidden items-center gap-1.5 text-[14px] text-muted sm:flex">
          {folder ? <Folder className="h-3.5 w-3.5" /> : isVideo(item) ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
          {kind}
        </span>
        <span className="hidden text-[14px] tabular-nums text-muted sm:block">{folder ? '—' : formatBytes(item.size)}</span>
        <span className="hidden text-[14px] text-muted sm:block">{formatDate(item.modifiedTime)}</span>
        <div className="flex items-center gap-0.5">
          <div className="hidden gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
            {!folder && (
              <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onAction('download', item))} aria-label={`Download ${item.name}`}>
                <Download className="h-4 w-4" />
              </button>
            )}
            <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onAction('rename', item))} aria-label={`Rename ${item.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button className="icon-btn h-8 w-8 hover:!text-danger" onClick={(e) => (e.stopPropagation(), ctx.onAction('delete', item))} aria-label={`Delete ${item.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <button className="icon-btn h-8 w-8" onClick={(e) => (e.stopPropagation(), ctx.onContextMenu(item, e))} aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
});

/** List view: a compact table with name, type, size and modified date. */
export default function FileList({ items, ctx, allSelected, someSelected, onSelectAll }) {
  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-ink/[0.06] px-3 pb-3 text-[13px] text-muted sm:grid-cols-[auto_1fr_90px_90px_140px_auto]">
        <div className="flex items-center gap-3">
          <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={onSelectAll} label="Select all" />
          <span className="w-12" />
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
