import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { googleLogout, hasGrantedAllScopesGoogle, useGoogleLogin, useGoogleOAuth } from '@react-oauth/google';
import { configureDrive, DriveError, getUserInfo, resetRootFolder } from '../lib/drive';
import { clearAll as clearMediaCache } from '../lib/mediaCache';

export const AuthContext = createContext(null);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'profile', 'email'];
const DRIVE_SCOPE = SCOPES[0];

// Refresh a little before the real expiry so in-flight requests don't race it.
const EXPIRY_MARGIN_MS = 60_000;
const SILENT_TIMEOUT_MS = 8_000;

/**
 * Auth state for the implicit (token) flow.
 *
 * The access token lives only in a ref — never in localStorage/sessionStorage —
 * so it disappears when the tab closes. Implicit-flow tokens can't be refreshed
 * with a refresh token; instead we ask Google Identity Services for a new one:
 *   1. silently (prompt: 'none'), which works when the user already consented
 *      and the browser allows the brief popup, then
 *   2. if that fails (popup blocked, consent needed, timeout), we show a
 *      "Session expired" dialog whose button is a real user gesture, so the
 *      popup is allowed.
 * Requests waiting on a refresh share one promise and replay once it resolves.
 */
export function AuthProvider({ children }) {
  const { scriptLoadedSuccessfully } = useGoogleOAuth();
  const tokenRef = useRef(null); // { accessToken, expiresAt }
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('signedOut'); // signedOut | signingIn | ready
  const [authError, setAuthError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const modeRef = useRef('interactive'); // what the next token response is for
  const pendingRef = useRef(null); // { promise, resolve, reject, timer }
  const userRef = useRef(null);
  userRef.current = user;

  const settlePending = useCallback((err, token) => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    err ? p.reject(err) : p.resolve(token);
  }, []);

  const onToken = useCallback(
    async (resp) => {
      if (!hasGrantedAllScopesGoogle(resp, DRIVE_SCOPE)) {
        const err = new DriveError('DriveGallery needs permission to manage the files it creates in your Drive.', {
          reason: 'scopeDenied',
        });
        setAuthError(err.message);
        settlePending(err);
        if (!tokenRef.current) setStatus('signedOut');
        return;
      }
      tokenRef.current = {
        accessToken: resp.access_token,
        expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000,
      };
      setAuthError(null);
      setSessionExpired(false);

      if (pendingRef.current) {
        settlePending(null, resp.access_token);
        return;
      }
      // First sign-in: load the profile for the top bar.
      try {
        const info = await getUserInfo();
        setUser({ name: info.name || info.email, email: info.email, picture: info.picture });
        setStatus('ready');
      } catch (e) {
        tokenRef.current = null;
        setStatus('signedOut');
        setAuthError(e.message);
      }
    },
    [settlePending],
  );

  const onFailure = useCallback(
    (err) => {
      if (modeRef.current === 'silent') {
        // Silent attempt failed → ask the user to continue explicitly.
        setSessionExpired(true);
        return;
      }
      if (pendingRef.current) {
        // The user dismissed the "continue" popup; keep the dialog up.
        setSessionExpired(true);
        return;
      }
      setStatus('signedOut');
      const type = err?.type || err?.error;
      if (type !== 'popup_closed' && type !== 'access_denied') {
        setAuthError(err?.error_description || 'Google sign-in failed. Please try again.');
      }
    },
    [],
  );

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: SCOPES.join(' '),
    onSuccess: onToken,
    onError: onFailure,
    onNonOAuthError: onFailure,
  });

  const signIn = useCallback(() => {
    setAuthError(null);
    setStatus('signingIn');
    modeRef.current = 'interactive';
    login();
  }, [login]);

  /** Force a new token. Concurrent callers share the same promise. */
  const refreshToken = useCallback(() => {
    if (pendingRef.current) return pendingRef.current.promise;
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timer = setTimeout(() => setSessionExpired(true), SILENT_TIMEOUT_MS);
    pendingRef.current = { promise, resolve, reject, timer };
    modeRef.current = 'silent';
    try {
      login({ prompt: 'none', hint: userRef.current?.email });
    } catch {
      setSessionExpired(true);
    }
    return promise;
  }, [login]);

  /** Button handler in the "Session expired" dialog (a user gesture). */
  const continueSession = useCallback(() => {
    modeRef.current = 'continue';
    login({ prompt: '', hint: userRef.current?.email });
  }, [login]);

  const getToken = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return null;
    if (Date.now() > t.expiresAt - EXPIRY_MARGIN_MS) return refreshToken();
    return t.accessToken;
  }, [refreshToken]);

  const signOut = useCallback(() => {
    googleLogout();
    tokenRef.current = null;
    settlePending(new DriveError('Signed out', { status: 401, reason: 'unauthenticated' }));
    setSessionExpired(false);
    setUser(null);
    setStatus('signedOut');
    clearMediaCache();
    resetRootFolder();
  }, [settlePending]);

  // Hand the token functions to the Drive client. Done during render (not in an
  // effect) so child effects that fire API calls on mount already see them.
  configureDrive({ getToken, refreshToken });

  // When the tab comes back after a long sleep, check expiry up front.
  useEffect(() => {
    const onVisible = () => {
      const t = tokenRef.current;
      if (document.visibilityState === 'visible' && t && Date.now() > t.expiresAt - EXPIRY_MARGIN_MS) {
        refreshToken().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshToken]);

  const value = useMemo(
    () => ({
      user,
      status,
      authError,
      ready: scriptLoadedSuccessfully,
      sessionExpired,
      signIn,
      signOut,
      continueSession,
      getToken,
    }),
    [user, status, authError, scriptLoadedSuccessfully, sessionExpired, signIn, signOut, continueSession, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
