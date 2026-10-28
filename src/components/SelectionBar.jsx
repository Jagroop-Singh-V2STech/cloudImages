import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare, Download, FolderInput, FolderPlus, Trash2, Upload, X } from 'lucide-react';
import { SortMenu, ViewToggle } from './TopBar';

/** Floating bulk-action bar shown while items are selected. */
export function SelectionBar({ count, onClear, onSelectAll, onDownload, onMove, onDelete, canDownload }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 md:bottom-6"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          <div className="flex items-center gap-1 rounded-2xl bg-slate-900 p-1.5 pl-2 text-white shadow-float ring-1 ring-white/10 dark:bg-slate-800">
            <button className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white/10" onClick={onClear} aria-label="Clear selection (Esc)" title="Clear selection (Esc)">
              <X className="h-4 w-4" />
            </button>
            <motion.span key={count} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="min-w-[72px] px-1 text-sm font-medium tabular-nums">
              {count} selected
            </motion.span>
            <div className="mx-1 h-6 w-px bg-white/15" />
            <BarButton icon={CheckSquare} label="Select all" onClick={onSelectAll} />
            <BarButton icon={Download} label="Download" onClick={onDownload} disabled={!canDownload} />
            <BarButton icon={FolderInput} label="Move" onClick={onMove} />
            <BarButton icon={Trash2} label="Delete" onClick={onDelete} danger />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BarButton({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
        danger ? 'hover:bg-red-500/20 hover:text-red-300' : 'hover:bg-white/10'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Bottom action bar on small screens (hidden while a selection is active). */
export function MobileActions({ hidden, onUpload, onNewFolder, view, onView, sort, direction, onSort }) {
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/85 backdrop-blur-xl md:hidden dark:border-white/[0.06] dark:bg-[#0b0f17]/85"
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        >
          <div className="flex h-16 items-center gap-2 px-3">
            <SortMenuUp sort={sort} direction={direction} onSort={onSort} />
            <ViewToggle view={view} onChange={onView} />
            <div className="flex-1" />
            <button className="btn-secondary h-11 w-11 px-0" onClick={onNewFolder} aria-label="New folder">
              <FolderPlus className="h-5 w-5" />
            </button>
            <button className="btn-primary h-11 px-5" onClick={onUpload}>
              <Upload className="h-5 w-5" /> Upload
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The sort dropdown opens downward; on the bottom bar we flip it up.
function SortMenuUp(props) {
  return (
    <div className="[&_[role=menu]]:bottom-full [&_[role=menu]]:left-0 [&_[role=menu]]:right-auto [&_[role=menu]]:top-auto [&_[role=menu]]:mb-2 [&_[role=menu]]:origin-bottom-left">
      <SortMenu sort={props.sort} direction={props.direction} onChange={props.onSort} />
    </div>
  );
}
