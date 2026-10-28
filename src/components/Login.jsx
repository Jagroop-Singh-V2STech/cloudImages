import { motion } from 'framer-motion';
import { Cloud, FolderLock, ImagePlay, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './ui';
import Logo from './Logo';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const features = [
  { icon: Cloud, title: 'Your Drive, your files', text: 'Media is stored in a DriveGallery folder in your own Google Drive.' },
  { icon: FolderLock, title: 'Least-privilege access', text: 'The app can only see files it created. The rest of your Drive stays private.' },
  { icon: ImagePlay, title: 'Photos and videos', text: 'Fast thumbnails, a fullscreen viewer, and resumable uploads for big videos.' },
];

// Decorative floating tiles behind the sign-in card.
const tiles = [
  'from-sky-400 to-indigo-500 left-[6%] top-[12%] h-28 w-24 -rotate-6',
  'from-amber-300 to-rose-400 right-[8%] top-[18%] h-24 w-32 rotate-6',
  'from-emerald-300 to-teal-500 left-[12%] bottom-[14%] h-24 w-32 rotate-3',
  'from-fuchsia-400 to-purple-600 right-[14%] bottom-[10%] h-32 w-24 -rotate-3',
];

export default function Login() {
  const { signIn, status, ready, authError } = useAuth();
  const busy = status === 'signingIn';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,108,246,0.16),transparent_60%)]" />
      {tiles.map((t, i) => (
        <motion.div
          key={t}
          aria-hidden
          className={`pointer-events-none absolute hidden rounded-2xl bg-gradient-to-br opacity-60 shadow-lift blur-[0.5px] md:block dark:opacity-40 ${t}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 0.6, y: [0, -10, 0] }}
          transition={{ opacity: { delay: 0.2 + i * 0.1 }, y: { duration: 6 + i, repeat: Infinity, ease: 'easeInOut' } }}
        />
      ))}

      <motion.div
        className="panel relative w-full max-w-md p-8 sm:p-10"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      >
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">DriveGallery</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Your photos and videos, in your own Drive</p>
          </div>
        </div>

        <ul className="mt-8 space-y-4">
          {features.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              className="flex gap-3"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
              </div>
            </motion.li>
          ))}
        </ul>

        <button
          onClick={signIn}
          disabled={!ready || busy}
          className="btn-secondary mt-8 h-12 w-full text-[15px] shadow-sm"
        >
          {busy || !ready ? <Spinner className="h-5 w-5" /> : <GoogleG />}
          {busy ? 'Waiting for Google…' : 'Sign in with Google'}
        </button>

        {authError && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {authError}
          </motion.p>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> No server. Your token stays in this tab’s memory.
        </p>
      </motion.div>
    </div>
  );
}
