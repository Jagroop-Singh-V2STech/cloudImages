import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ExternalLink, Info, X } from 'lucide-react';
import { useToast, useToastList } from '../hooks/useToast';
import { ProgressBar, Spinner } from './ui';

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-brand-500" />,
  loading: <Spinner className="h-5 w-5 text-brand-500" />,
};

export default function Toasts() {
  const toasts = useToastList();
  const toast = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[72px] z-[95] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-6 md:top-20 md:w-[400px] md:items-end md:px-0"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="panel pointer-events-auto flex w-full max-w-[420px] items-start gap-3 p-3.5 pr-2"
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            <div className="mt-0.5 shrink-0">{icons[t.type]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.description}</p>}
              {t.progress != null && <ProgressBar value={t.progress} className="mt-2 h-1" />}
              {t.link && (
                <a
                  href={t.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t.link.label} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {t.action && (
              <button
                className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                onClick={() => {
                  t.action.onClick();
                  toast.dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn h-7 w-7 shrink-0" onClick={() => toast.dismiss(t.id)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
