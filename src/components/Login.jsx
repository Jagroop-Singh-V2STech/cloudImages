import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from './ui';
import Logo from './Logo';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const rise = (delay) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay },
});

export default function Login() {
  const { signIn, status, ready, authError } = useAuth();
  const busy = status === 'signingIn';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <div className="flex w-full max-w-[420px] flex-col items-center text-center">
        <motion.div {...rise(0)}>
          <Logo className="h-16 w-16 rounded-logo" iconClassName="h-8 w-8" />
        </motion.div>

        <motion.h1 className="mt-8 text-[36px] leading-[1.08] sm:text-[44px]" {...rise(0.06)}>
          Welcome to DriveGallery
        </motion.h1>
        <motion.p className="mt-4 text-[17px] leading-snug text-muted" {...rise(0.12)}>
          Your photos and videos, kept in your own Google&nbsp;Drive.
        </motion.p>

        <motion.div className="mt-10 w-full max-w-[320px]" {...rise(0.18)}>
          <button
            type="button"
            onClick={signIn}
            disabled={!ready || busy}
            className="inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-full border border-hairline bg-card text-[17px] font-medium text-ink transition-[background-color,transform] duration-150 hover:bg-card-hover active:scale-[0.98] disabled:opacity-60"
          >
            {busy || !ready ? <Spinner className="h-5 w-5 text-muted" /> : <GoogleG />}
            {busy ? 'Waiting for Google…' : 'Continue with Google'}
          </button>
        </motion.div>

        {authError && (
          <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-[14px] text-danger">
            {authError}
          </motion.p>
        )}

        <motion.p className="mt-6 text-[13px] leading-relaxed text-muted" {...rise(0.24)}>
          We never store your files. By continuing you agree to our{' '}
          <a href="/privacy.html" className="text-accent-link underline underline-offset-2 hover:no-underline">
            Privacy Policy
          </a>
          .
        </motion.p>
      </div>
    </main>
  );
}
