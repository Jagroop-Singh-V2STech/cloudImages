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
          <div className="absolute inset-0 bg-black/20 backdrop-blur-md" onClick={() => dismissible && onClose?.()} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative w-full ${widths[size]} rounded-[24px] bg-card p-7 shadow-float`}
            {...modal}
          >
            {dismissible && (
              <button data-close className="icon-btn absolute right-4 top-4 h-8 w-8" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            )}
            {(Icon || title) && (
              <div className="mb-5 pr-8">
                {Icon && (
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                )}
                <h2 className="text-[22px] leading-tight">{title}</h2>
                {description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>}
              </div>
            )}
            {children}
            {footer && <div className="mt-7 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Dropdown menu anchored to a trigger. `children` receives a close() function. */
export function Dropdown({ trigger, children, align = 'right', width = 'w-56', placement = 'bottom' }) {
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

  const side = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  const origin = `${placement === 'top' ? 'origin-bottom' : 'origin-top'}-${align === 'right' ? 'right' : 'left'}`;

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`panel absolute z-50 ${side} ${width} p-1.5 ${align === 'right' ? 'right-0' : 'left-0'} ${origin}`}
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
      className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 ${
        checked || indeterminate
          ? 'bg-accent text-white'
          : 'bg-card/80 text-transparent ring-1 ring-inset ring-ink/20 backdrop-blur hover:ring-accent'
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
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-[#34c759]' : 'bg-track'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
          className={`h-[22px] w-[22px] rounded-full bg-white shadow-pill ${checked ? 'ml-[20px]' : 'ml-[2px]'}`}
        />
      </button>
      <span className="min-w-0 text-[14px]">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </div>
  );
}

/** Animated progress bar; width eases with a spring. */
export function ProgressBar({ value, tone = 'ink', className = 'h-1' }) {
  const tones = {
    ink: 'bg-ink',
    accent: 'bg-accent',
    success: 'bg-[#34c759]',
    error: 'bg-danger-fill',
    amber: 'bg-warn-fill',
    muted: 'bg-muted',
  };
  return (
    <div className={`w-full overflow-hidden rounded-full bg-track ${className}`}>
      <motion.div
        className={`h-full rounded-full ${tones[tone]}`}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
    </div>
  );
}

/** Pill-shaped segmented control with a sliding white thumb. */
export function Segmented({ options, value, onChange, label, layoutId }) {
  return (
    <div className="flex rounded-full bg-surface p-1" role="radiogroup" aria-label={label}>
      {options.map(({ id, label: text, icon: Icon, ariaLabel }) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          aria-label={ariaLabel}
          title={ariaLabel}
          onClick={() => onChange(id)}
          className={`relative flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[14px] transition-colors ${
            value === id ? 'text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {value === id && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-card shadow-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {Icon && <Icon className="relative h-4 w-4" />}
          {text && <span className="relative">{text}</span>}
        </button>
      ))}
    </div>
  );
}
