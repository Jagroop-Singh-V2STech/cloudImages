import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronDown, Film, ImageIcon, RotateCw, X, XCircle } from 'lucide-react';
import { formatBytes, formatSpeed, plural } from '../lib/format';
import { ProgressBar, Spinner } from './ui';

function StatusLine({ item }) {
  switch (item.status) {
    case 'queued':
      return <span>Waiting…</span>;
    case 'preparing':
      return <span>Optimizing image…</span>;
    case 'uploading':
      return (
        <span className="tabular-nums">
          {formatBytes(item.loaded)} of {formatBytes(item.total)}
          {item.speed > 0 && <> · {formatSpeed(item.speed)}</>}
        </span>
      );
    case 'done':
      return <span className="text-emerald-600 dark:text-emerald-400">Uploaded · {formatBytes(item.total)}</span>;
    case 'canceled':
      return <span>Canceled</span>;
    case 'error':
      return <span className="text-red-600 dark:text-red-400" title={item.error}>{item.error || 'Failed'}</span>;
    default:
      return null;
  }
}

function UploadRow({ item, onCancel, onRetry }) {
  const active = ['queued', 'preparing', 'uploading'].includes(item.status);
  const Icon = item.type.startsWith('video/') ? Film : ImageIcon;
  const tone = item.status === 'done' ? 'success' : item.status === 'error' ? 'error' : item.status === 'canceled' ? 'muted' : 'brand';
  const progress = item.status === 'done' ? 1 : item.total ? item.loaded / item.total : 0;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
          {item.status === 'done' ? (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </motion.span>
          ) : item.status === 'error' ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : item.status === 'canceled' ? (
            <XCircle className="h-5 w-5" />
          ) : (
            <Icon className="h-[18px] w-[18px]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            <StatusLine item={item} />
          </p>
          {item.status !== 'done' && item.status !== 'canceled' && <ProgressBar value={progress} tone={tone} className="mt-1.5 h-1" />}
        </div>
        {active ? (
          <button className="icon-btn h-8 w-8" onClick={() => onCancel(item.id)} aria-label={`Cancel ${item.name}`} title="Cancel">
            <X className="h-4 w-4" />
          </button>
        ) : (item.status === 'error' || item.status === 'canceled') ? (
          <button className="icon-btn h-8 w-8" onClick={() => onRetry(item.id)} aria-label={`Retry ${item.name}`} title="Retry">
            <RotateCw className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </motion.li>
  );
}

/** Collapsible upload queue, bottom-right. */
export default function UploadPanel({ queue }) {
  const [collapsed, setCollapsed] = useState(false);
  const { items, active, cancel, retry, cancelAll, clearFinished } = queue;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const totalBytes = items.reduce((s, i) => s + (i.status === 'canceled' ? 0 : i.total), 0);
  const loadedBytes = items.reduce((s, i) => s + (i.status === 'done' ? i.total : i.status === 'canceled' ? 0 : i.loaded), 0);

  const title = active
    ? `Uploading ${plural(active, 'item')}`
    : failed
      ? `${plural(failed, 'upload')} failed`
      : `${plural(done, 'upload')} complete`;

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          className="panel fixed bottom-20 right-3 z-40 w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden sm:right-6 md:bottom-6"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <div className="flex items-center gap-3 bg-slate-50/80 px-4 py-3 dark:bg-white/[0.03]">
            {active > 0 ? <Spinner className="h-4 w-4 text-brand-500" /> : failed ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              {active > 0 && <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatBytes(loadedBytes)} of {formatBytes(totalBytes)}</p>}
            </div>
            <button className="icon-btn h-8 w-8" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}>
              <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
            <button
              className="icon-btn h-8 w-8"
              onClick={active ? cancelAll : clearFinished}
              aria-label={active ? 'Cancel all uploads' : 'Close'}
              title={active ? 'Cancel all' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {active > 0 && <ProgressBar value={totalBytes ? loadedBytes / totalBytes : 0} className="h-0.5 rounded-none" />}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.ul
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="max-h-80 divide-y divide-slate-100 overflow-y-auto scrollbar-thin dark:divide-white/5"
              >
                <AnimatePresence initial={false}>
                  {items.map((it) => (
                    <UploadRow key={it.id} item={it} onCancel={cancel} onRetry={retry} />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
