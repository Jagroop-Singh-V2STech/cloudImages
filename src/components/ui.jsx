import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Minus, X } from 'lucide-react';
import { fade, modal, popover } from '../lib/motion';

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

/** Animated modal dialog rendered in a portal. Esc and backdrop click close it. */
export function Modal({ open, onClose, title, description, icon: Icon, children, footer, size = 'md', dismissible = true }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement;
    // Focus the first focusable control once the enter animation starts.
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector('[data-autofocus], input, button:not([data-close])');
      el?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose, dismissible]);

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" {...fade}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60" onClick={() => dismissible && onClose?.()} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`panel relative w-full ${widths[size]} p-6`}
            {...modal}
          >
            {dismissible && (
              <button data-close className="icon-btn absolute right-3 top-3" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            )}
            {(Icon || title) && (
              <div className="mb-4 flex items-start gap-3 pr-8">
                {Icon && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{title}</h2>
                  {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
              </div>
            )}
            {children}
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Dropdown menu anchored to a trigger. `children` receives a close() function. */
export function Dropdown({ trigger, children, align = 'right', width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`panel absolute top-full z-50 mt-2 ${width} p-1.5 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
            {...popover}
            role="menu"
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Checkbox({ checked, indeterminate, onChange, className = '', label = 'Select' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(e);
      }}
      className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-150 ${
        checked || indeterminate
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/30'
          : 'border-slate-300 bg-white/90 hover:border-brand-500 dark:border-white/25 dark:bg-slate-900/70'
      } ${className}`}
    >
      <AnimatePresence initial={false}>
        {(checked || indeterminate) && (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
            {indeterminate ? <Minus className="h-3.5 w-3.5" strokeWidth={3} /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function Switch({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-white/20'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
          className={`h-4 w-4 rounded-full bg-white shadow ${checked ? 'ml-[18px]' : 'ml-0.5'}`}
        />
      </button>
      <span className="min-w-0 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {description && <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
    </label>
  );
}

/** Animated progress bar; width eases with a spring. */
export function ProgressBar({ value, tone = 'brand', className = 'h-1.5' }) {
  const tones = {
    brand: 'bg-brand-500',
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    amber: 'bg-amber-500',
    muted: 'bg-slate-400',
  };
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10 ${className}`}>
      <motion.div
        className={`h-full rounded-full ${tones[tone]}`}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
    </div>
  );
}
