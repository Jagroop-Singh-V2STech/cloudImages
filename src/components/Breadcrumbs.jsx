import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Home, Search } from 'lucide-react';
import { DRAG_TYPE, readDragIds } from '../lib/dnd';

/** Breadcrumb trail. Each crumb is also a drop target for moving items up the tree. */
export default function Breadcrumbs({ path, search, onNavigate, onDropItems }) {
  const [over, setOver] = useState(null);

  if (search) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-slate-500 dark:text-slate-400">
          Results for <span className="font-semibold text-slate-900 dark:text-slate-100">“{search}”</span> in all of DriveGallery
        </span>
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm scrollbar-thin">
      <AnimatePresence initial={false} mode="popLayout">
        {path.map((crumb, i) => {
          const last = i === path.length - 1;
          return (
            <motion.div
              key={crumb.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              className="flex shrink-0 items-center"
            >
              {i > 0 && <ChevronRight className="mx-0.5 h-4 w-4 text-slate-300 dark:text-slate-600" />}
              <button
                onClick={() => !last && onNavigate(i)}
                aria-current={last ? 'page' : undefined}
                onDragOver={(e) => {
                  if (last || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setOver(crumb.id);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  const ids = readDragIds(e);
                  if (ids && !last) {
                    e.preventDefault();
                    onDropItems(crumb, ids);
                  }
                }}
                className={`flex max-w-[14rem] items-center gap-1.5 truncate rounded-lg px-2 py-1 transition-colors ${
                  last
                    ? 'font-semibold text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                } ${over === crumb.id ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-400 dark:bg-brand-500/20 dark:text-brand-200' : ''}`}
              >
                {i === 0 && <Home className="h-4 w-4 shrink-0" />}
                <span className="truncate">{i === 0 ? 'My Gallery' : crumb.name}</span>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </nav>
  );
}
