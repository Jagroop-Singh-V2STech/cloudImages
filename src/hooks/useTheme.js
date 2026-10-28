import { useCallback, useEffect, useState } from 'react';

const KEY = 'dg-theme';
const read = () => {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
};

/** 'system' | 'light' | 'dark', defaulting to the OS preference. */
export function useTheme() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const cycle = useCallback(() => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system')), []);
  return { theme, setTheme, cycle };
}
