import { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Folder, MoreVertical } from 'lucide-react';
import { DRAG_TYPE, readDragIds, writeDragIds } from '../lib/dnd';
import { formatDate } from '../lib/format';
import { gridItem } from '../lib/motion';
import { Checkbox } from './ui';

/** Folder tile: horizontal, compact, and a drop target for moving items. */
// forwardRef: AnimatePresence mode="popLayout" measures exiting cards via ref.
const FolderCard = forwardRef(function FolderCard({ folder, index, ctx }, ref) {
  const [over, setOver] = useState(false);
  const selected = ctx.isSelected(folder.id);

  return (
    <motion.div ref={ref} layout="position" variants={gridItem} custom={index} initial="initial" animate="animate" exit="exit">
      <div
        draggable
        onDragStart={(e) => writeDragIds(e, ctx.dragIdsFor(folder), folder.name)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const ids = readDragIds(e);
          if (!ids) return;
          e.preventDefault();
          e.stopPropagation();
          ctx.onDropOnFolder(folder, ids);
        }}
        onClick={(e) => ctx.onItemClick(folder, e)}
        onDoubleClick={() => ctx.onOpen(folder)}
        onContextMenu={(e) => ctx.onContextMenu(folder, e)}
        onKeyDown={(e) => e.key === 'Enter' && ctx.onOpen(folder)}
        tabIndex={0}
        data-item-id={folder.id}
        className={`group relative flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ${
          over
            ? 'scale-[1.03] bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15'
            : selected
              ? 'bg-brand-50 ring-brand-500/60 dark:bg-brand-500/15 dark:ring-brand-400/50'
              : 'bg-white ring-slate-200/80 shadow-card hover:ring-slate-300 dark:bg-white/[0.04] dark:ring-white/[0.07] dark:hover:bg-white/[0.07]'
        }`}
      >
        <div
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            over ? 'bg-brand-600 text-white' : 'bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300'
          }`}
        >
          <Folder className="h-5 w-5" fill="currentColor" fillOpacity={0.25} />
          <div className={`absolute -left-1.5 -top-1.5 transition-opacity ${selected || ctx.selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}>
            <Checkbox checked={selected} onChange={(e) => ctx.onToggle(folder, e)} label={`Select ${folder.name}`} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{folder.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{over ? 'Drop to move here' : formatDate(folder.modifiedTime)}</p>
        </div>
        <button
          className="icon-btn h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            ctx.onContextMenu(folder, e);
          }}
          aria-label="More actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
});

export default FolderCard;
