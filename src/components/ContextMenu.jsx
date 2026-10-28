import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, ExternalLink, FolderInput, FolderOpen, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { isFolder, plural } from '../lib/format';

/**
 * Right-click menu. `menu` = { x, y, items: [file, ...] }. With several items
 * selected it shows bulk actions only.
 */
export default function ContextMenu({ menu, onClose, onAction }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menu, onClose]);

  const items = menu?.items || [];
  const single = items.length === 1 ? items[0] : null;
  const folder = single && isFolder(single);
  const hasFiles = items.some((i) => !isFolder(i));

  const entries = single
    ? [
        { id: 'open', label: folder ? 'Open' : 'Preview', icon: folder ? FolderOpen : Maximize2, kbd: '↵' },
        !folder && { id: 'download', label: 'Download', icon: Download },
        { id: 'drive', label: 'Open in Google Drive', icon: ExternalLink },
        'sep',
        { id: 'rename', label: 'Rename', icon: Pencil, kbd: 'F2' },
        { id: 'move', label: 'Move to…', icon: FolderInput },
        'sep',
        { id: 'delete', label: 'Move to trash', icon: Trash2, kbd: 'Del', danger: true },
      ]
    : [
        hasFiles && { id: 'download', label: `Download ${plural(items.filter((i) => !isFolder(i)).length, 'file')}`, icon: Download },
        { id: 'move', label: `Move ${plural(items.length, 'item')}…`, icon: FolderInput },
        'sep',
        { id: 'delete', label: `Move ${plural(items.length, 'item')} to trash`, icon: Trash2, kbd: 'Del', danger: true },
      ];

  return createPortal(
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          role="menu"
          className="panel fixed z-[65] w-60 p-1.5"
          style={pos}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.12 } }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.08 } }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {single && <p className="truncate px-2.5 pb-1.5 pt-1 text-xs font-medium text-slate-400">{single.name}</p>}
          {entries.filter(Boolean).map((e, i) =>
            e === 'sep' ? (
              <div key={`sep${i}`} className="my-1 h-px bg-slate-100 dark:bg-white/10" />
            ) : (
              <button
                key={e.id}
                role="menuitem"
                className={`menu-item ${e.danger ? '!text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-500/10' : ''}`}
                onClick={() => {
                  onClose();
                  onAction(e.id, items);
                }}
              >
                <e.icon className="h-4 w-4" />
                <span className="flex-1">{e.label}</span>
                {e.kbd && <kbd className="text-[11px] text-slate-400">{e.kbd}</kbd>}
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
