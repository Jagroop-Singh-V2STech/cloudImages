/** Shared framer-motion presets so every surface moves the same way. */
export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 };

export const popover = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.2, 0.9, 0.3, 1] } },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
};

export const modal = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
};

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Staggered entrance for grid items; the index is passed via `custom`. */
export const gridItem = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: (i = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...softSpring, delay: Math.min(i, 24) * 0.025 },
  }),
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.18 } },
};
