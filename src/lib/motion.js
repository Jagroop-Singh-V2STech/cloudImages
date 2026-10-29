/** Shared framer-motion presets so every surface moves the same way. */
export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 };
const ease = [0.25, 0.1, 0.25, 1];

export const popover = {
  initial: { opacity: 0, scale: 0.97, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease } },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.12 } },
};

export const modal = {
  initial: { opacity: 0, scale: 0.96, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.16 } },
};

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
};

/** Staggered fade-and-rise for grid tiles; the index is passed via `custom`. */
export const gridItem = {
  initial: { opacity: 0, y: 12 },
  animate: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease, delay: Math.min(i, 24) * 0.03 },
  }),
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
};

/** Hover lift for tiles (2px with a soft shadow). */
export const tileHover = { y: -2, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.18)', transition: { duration: 0.2, ease } };
