import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare, Download, FolderInput, Trash2, X } from 'lucide-react';

/** Floating bulk-action pill shown while items are selected. */
export function SelectionBar({ count, onClear, onSelectAll, onDownload, onMove, onDelete, canDownload }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          className="pb-safe fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 md:bottom-8 md:pl-[260px]"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          <div role="toolbar" aria-label="Selection actions" className="flex items-center gap-0.5 rounded-full bg-card/95 p-1.5 pl-2 text-ink shadow-float backdrop-blur-xl">
            <button className="icon-btn h-9 w-9 text-ink" onClick={onClear} aria-label="Clear selection (Esc)" title="Clear selection (Esc)">
              <X className="h-4 w-4" />
            </button>
            <motion.span key={count} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="min-w-[84px] px-1 text-[15px] font-medium tabular-nums" aria-live="polite">
              {count} selected
            </motion.span>
            <div className="mx-1 h-5 w-px bg-ink/10" />
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
      aria-label={label}
      className={`flex h-9 items-center gap-2 rounded-full px-3 text-[14px] transition-colors disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-surface'
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
