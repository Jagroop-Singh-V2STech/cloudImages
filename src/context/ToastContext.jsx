import { createContext, useCallback, useMemo, useRef, useState } from 'react';

export const ToastContext = createContext(null);

let nextId = 1;
const DEFAULT_DURATION = { success: 3500, info: 4000, error: 7000, loading: null };

/**
 * Toast state. A toast: { id, type, title, description, action: {label, onClick},
 * link: {label, href}, progress (0–1 or null), duration (ms or null = sticky) }.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback(
    (id, duration) => {
      clearTimeout(timers.current.get(id));
      if (duration) timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  const show = useCallback(
    (type, title, opts = {}) => {
      const id = opts.id ?? nextId++;
      const duration = opts.duration !== undefined ? opts.duration : DEFAULT_DURATION[type];
      const toast = { id, type, title, progress: null, ...opts, duration };
      setToasts((t) => {
        const exists = t.some((x) => x.id === id);
        return exists ? t.map((x) => (x.id === id ? toast : x)) : [...t.slice(-4), toast];
      });
      arm(id, duration);
      return id;
    },
    [arm],
  );

  const update = useCallback(
    (id, patch) => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if ('duration' in patch || 'type' in patch) {
        arm(id, patch.duration !== undefined ? patch.duration : DEFAULT_DURATION[patch.type]);
      }
    },
    [arm],
  );

  const api = useMemo(
    () => ({
      success: (title, o) => show('success', title, o),
      error: (title, o) => show('error', title, o),
      info: (title, o) => show('info', title, o),
      loading: (title, o) => show('loading', title, o),
      update,
      dismiss,
    }),
    [show, update, dismiss],
  );

  const value = useMemo(() => ({ toasts, toast: api }), [toasts, api]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
