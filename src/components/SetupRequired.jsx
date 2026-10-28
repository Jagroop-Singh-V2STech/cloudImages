import { KeyRound } from 'lucide-react';
import Logo from './Logo';

/** Shown when VITE_GOOGLE_CLIENT_ID is missing, instead of a broken login button. */
export default function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="panel max-w-lg p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold">DriveGallery</span>
        </div>
        <div className="mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <KeyRound className="h-5 w-5" />
          <h1 className="font-semibold">Google OAuth Client ID missing</h1>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Copy <code className="rounded bg-slate-100 px-1 dark:bg-white/10">.env.example</code> to <code className="rounded bg-slate-100 px-1 dark:bg-white/10">.env</code>.</li>
          <li>Set <code className="rounded bg-slate-100 px-1 dark:bg-white/10">VITE_GOOGLE_CLIENT_ID</code> to your Web OAuth client ID.</li>
          <li>Restart <code className="rounded bg-slate-100 px-1 dark:bg-white/10">npm run dev</code>.</li>
        </ol>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">The README walks through the Google Cloud setup.</p>
      </div>
    </div>
  );
}
