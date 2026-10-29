import { motion } from 'framer-motion';
import { AlertTriangle, Heart, History, ImagePlus, SearchX } from 'lucide-react';

const variants = {
  empty: { icon: ImagePlus, title: 'Nothing here yet', text: 'Drag photos and videos anywhere on the page, or use Upload.' },
  search: { icon: SearchX, title: 'No results', text: 'Try a different name, or switch the filter back to All.' },
  filtered: { icon: SearchX, title: 'Nothing of that type here', text: 'Switch the filter back to All to see everything in this folder.' },
  recents: { icon: History, title: 'No recents yet', text: 'Photos and videos you open or upload in this browser show up here.' },
  favorites: { icon: Heart, title: 'No favorites yet', text: 'Choose Add to Favorites from a photo’s menu or the viewer to keep it here.' },
  error: { icon: AlertTriangle, title: 'Couldn’t load this folder', text: 'Check your connection and try again.' },
};

/** Quiet, centered message with a single icon and the next sensible action. */
export default function EmptyState({ kind = 'empty', message, onUpload, onNewFolder, onRetry }) {
  const v = variants[kind];
  const Icon = v.icon;

  return (
    <motion.div
      className="flex flex-col items-center justify-center px-6 py-24 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full ${kind === 'error' ? 'bg-danger-soft text-danger' : 'bg-surface text-muted'}`}>
        <Icon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="text-[24px]">{v.title}</h2>
      <p className="mt-2 max-w-sm text-[17px] text-muted">{message || v.text}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {kind === 'empty' && onUpload && (
          <button className="btn-primary h-11" onClick={onUpload}>
            Upload
          </button>
        )}
        {kind === 'empty' && onNewFolder && (
          <button className="btn-secondary h-11" onClick={onNewFolder}>
            New folder
          </button>
        )}
        {kind === 'error' && onRetry && (
          <button className="btn-secondary h-11" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </motion.div>
  );
}
