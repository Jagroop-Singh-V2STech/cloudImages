import { motion } from 'framer-motion';
import { AlertTriangle, FolderPlus, ImagePlus, SearchX, Upload } from 'lucide-react';

const variants = {
  empty: { icon: ImagePlus, title: 'This folder is empty', text: 'Drag photos and videos anywhere on the page, or use the Upload button.' },
  search: { icon: SearchX, title: 'No matches', text: 'Try a different name, or clear the type filter.' },
  filtered: { icon: SearchX, title: 'Nothing of that type here', text: 'Switch the filter back to All to see everything in this folder.' },
  error: { icon: AlertTriangle, title: 'Couldn’t load this folder', text: 'Check your connection and try again.' },
};

/** Friendly empty state: a layered icon "illustration" plus a message and actions. */
export default function EmptyState({ kind = 'empty', message, onUpload, onNewFolder, onRetry }) {
  const v = variants[kind];
  const Icon = v.icon;
  const tone = kind === 'error' ? 'text-red-500 bg-red-50 dark:bg-red-500/10' : 'text-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:text-brand-300';

  return (
    <motion.div
      className="flex flex-col items-center justify-center px-6 py-20 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
    >
      <div className="relative mb-6 h-28 w-28">
        <motion.div
          className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-brand-100 to-indigo-100 dark:from-brand-500/10 dark:to-indigo-500/10"
          animate={{ rotate: [6, 10, 6] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-sky-100 to-emerald-50 dark:from-sky-500/10 dark:to-emerald-500/5"
          animate={{ rotate: [-6, -10, -6] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className={`absolute inset-3 flex items-center justify-center rounded-3xl shadow-card ring-1 ring-black/5 ${tone}`}>
          <Icon className="h-10 w-10" strokeWidth={1.6} />
        </div>
      </div>
      <h3 className="text-lg font-semibold">{v.title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message || v.text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {kind === 'empty' && onUpload && (
          <button className="btn-primary" onClick={onUpload}>
            <Upload className="h-4 w-4" /> Upload media
          </button>
        )}
        {kind === 'empty' && onNewFolder && (
          <button className="btn-secondary" onClick={onNewFolder}>
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
        )}
        {kind === 'error' && onRetry && (
          <button className="btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </motion.div>
  );
}
