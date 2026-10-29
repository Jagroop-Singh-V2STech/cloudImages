import { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { DRAG_TYPE, readDragIds, writeDragIds } from '../lib/dnd';
import { formatDate } from '../lib/format';
import { gridItem, tileHover } from '../lib/motion';
import { Checkbox } from './ui';

/** Folder tile: same footprint as a photo, a quiet surface with the name bottom-left. Also a drop target. */
// forwardRef: AnimatePresence mode="popLayout" measures exiting tiles via ref.
const FolderCard = forwardRef(function FolderCard({ folder, index, ctx }, ref) {
  const [over, setOver] = useState(false);
  const selected = ctx.isSelected(folder.id);
  const reveal = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

  return (
    <motion.div ref={ref} layout="position" variants={gridItem} custom={index} initial="initial" animate="animate" exit="exit">
      <motion.div whileHover={tileHover} className="rounded-tile">
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
          aria-label={`Folder: ${folder.name}`}
          data-item-id={folder.id}
          className={`group relative flex h-[190px] cursor-pointer flex-col justify-end rounded-tile p-6 transition-colors ${
            over ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface'
          } ${selected ? 'ring-[3px] ring-accent ring-offset-2 ring-offset-page' : ''}`}
        >
          <p className="truncate text-[21px] font-semibold tracking-[-0.02em] text-ink">{folder.name}</p>
          <p className="truncate text-[15px] text-muted">{over ? 'Drop to move here' : `Folder · ${formatDate(folder.modifiedTime)}`}</p>

          <div className={`absolute left-3 top-3 transition-opacity ${selected || ctx.selectionMode ? 'opacity-100' : reveal}`}>
            <Checkbox checked={selected} onChange={(e) => ctx.onToggle(folder, e)} label={`Select ${folder.name}`} />
          </div>
          <button
            className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-card text-ink transition-opacity hover:bg-card ${reveal}`}
            onClick={(e) => {
              e.stopPropagation();
              ctx.onContextMenu(folder, e);
            }}
            aria-label={`More actions for ${folder.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});

export default FolderCard;
