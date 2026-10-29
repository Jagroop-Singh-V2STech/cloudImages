import Logo from './Logo';

/** Shown when VITE_GOOGLE_CLIENT_ID is missing, instead of a broken login button. */
export default function SetupRequired() {
  const code = 'rounded-md bg-card px-1.5 py-0.5 text-[14px] text-ink';
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <div className="w-full max-w-[460px]">
        <Logo className="h-14 w-14 rounded-logo" iconClassName="h-7 w-7" />
        <h1 className="mt-8 text-[32px] leading-tight">Almost ready</h1>
        <p className="mt-3 text-[17px] text-muted">DriveGallery needs a Google OAuth client ID before you can sign in.</p>
        <ol className="mt-8 list-decimal space-y-3 pl-5 text-[15px] text-ink">
          <li>Copy <code className={code}>.env.example</code> to <code className={code}>.env</code>.</li>
          <li>Set <code className={code}>VITE_GOOGLE_CLIENT_ID</code> to your Web OAuth client ID.</li>
          <li>Restart <code className={code}>npm run dev</code>.</li>
        </ol>
        <p className="mt-6 text-[14px] text-muted">The README walks through the Google Cloud setup.</p>
      </div>
    </main>
  );
}
