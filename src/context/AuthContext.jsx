import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { googleLogout, hasGrantedAllScopesGoogle, useGoogleLogin, useGoogleOAuth } from '@react-oauth/google';
import { configureDrive, DriveError, getUserInfo, resetPool } from '../lib/drive';
import { clearAll as clearMediaCache } from '../lib/mediaCache';

export const AuthContext = createContext(null);

export const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'profile', 'email'];
const DRIVE_SCOPE = SCOPES[0];

// Refresh a little before the real expiry so in-flight requests don't race it.
const EXPIRY_MARGIN_MS = 60_000;
const SILENT_TIMEOUT_MS = 8_000;

// The session survives a page reload but not closing the tab (sessionStorage is per-tab).
const SESSION_KEY = 'dg-session';

// The linked-accounts Worker (worker/index.js). Empty = same origin (the Vite
// dev server proxies /api and /link to `wrangler dev`).
const LINK_API = (import.meta.env.VITE_LINK_API_URL || '').replace(/\/$/, '');
const LINK_ORIGIN = LINK_API ? new URL(LINK_API).origin : window.location.origin;

/** Restore { accessToken, expiresAt, user } if the token still has life left. */
function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (s?.accessToken && s.user && Date.now() < s.expiresAt - EXPIRY_MARGIN_MS) return s;
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable or corrupt */
  }
  return null;
}

function saveSession(token, user) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...token, user }));
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Auth state.
 *
 * MAIN ACCOUNT: the implicit (token) flow, entirely in the browser.
 * The access token lives in a ref, mirrored to sessionStorage so a reload keeps
 * the user signed in; it is gone when the tab closes (never in localStorage),
 * and it expires after about an hour anyway. Implicit-flow tokens can't be refreshed
 * with a refresh token; instead we ask Google Identity Services for a new one:
 *   1. silently (prompt: 'none'), which works when the user already consented
 *      and the browser allows the brief popup, then
 *   2. if that fails (popup blocked, consent needed, timeout), we show a
 *      "Session expired" dialog whose button is a real user gesture, so the
 *      popup is allowed.
 * Requests waiting on a refresh share one promise and replay once it resolves.
 *
 * LINKED ACCOUNTS: handled by the Cloudflare Worker, which keeps each linked
 * account's refresh token so links survive sign-outs and closed tabs. The app
 * proves who it is to the Worker with the main account's access token, and
 * gets short-lived access tokens for linked accounts back (kept in memory).
 */
export function AuthProvider({ children }) {
  const { scriptLoadedSuccessfully } = useGoogleOAuth();
  const [restored] = useState(readSession);
  const tokenRef = useRef(restored && { accessToken: restored.accessToken, expiresAt: restored.expiresAt }); // { accessToken, expiresAt }
  const [user, setUser] = useState(restored?.user || null);
  const [status, setStatus] = useState(restored ? 'ready' : 'signedOut'); // signedOut | signingIn | ready
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
        if (userRef.current) saveSession(tokenRef.current, userRef.current);
        settlePending(null, resp.access_token);
        return;
      }
      // First sign-in: load the profile for the top bar.
      try {
        const info = await getUserInfo();
        const profile = { name: info.name || info.email, email: info.email, picture: info.picture };
        saveSession(tokenRef.current, profile);
        setUser(profile);
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
  const refreshPrimary = useCallback(() => {
    // Signed out: a late request must not reopen Google sign-in or the "Session expired" dialog.
    if (!tokenRef.current) return Promise.reject(new DriveError('Signed out', { status: 401, reason: 'unauthenticated' }));
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

  const getPrimaryToken = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return null;
    if (Date.now() > t.expiresAt - EXPIRY_MARGIN_MS) return refreshPrimary();
    return t.accessToken;
  }, [refreshPrimary]);

  /* ---------------- Linked accounts (via the Worker) ---------------- */

  const [links, setLinks] = useState([]); // [{ id, email, name, picture, needsReconnect }]
  const linksRef = useRef(links);
  const [linking, setLinking] = useState('unknown'); // unknown | available | unavailable
  const linkTokensRef = useRef(new Map()); // email → { accessToken, expiresAt }
  const linkInflightRef = useRef(new Map()); // email → Promise<token>

  const commitLinks = useCallback((list) => {
    linksRef.current = list;
    setLinks(list);
  }, []);

  /** Call the Worker as the main account. One retry with a fresh main token on 401. */
  const workerApi = useCallback(
    async (path, body) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = attempt ? await refreshPrimary() : await getPrimaryToken();
        if (!token) throw new DriveError('Signed out', { status: 401, reason: 'unauthenticated' });
        const res = await fetch(LINK_API + path, {
          method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401 && !attempt) continue;
        const data = res.headers.get('Content-Type')?.includes('application/json') ? await res.json() : null;
        return { status: res.status, ok: res.ok && data !== null, data: data || {} };
      }
      return { status: 401, ok: false, data: {} };
    },
    [getPrimaryToken, refreshPrimary],
  );

  const loadLinks = useCallback(async () => {
    try {
      const { ok, data } = await workerApi('/api/links');
      if (!ok) throw new Error('unavailable');
      commitLinks(data.accounts || []);
      setLinking('available');
    } catch {
      // No Worker configured (or unreachable): the app still works with the main account alone.
      commitLinks([]);
      setLinking('unavailable');
    }
  }, [workerApi, commitLinks]);

  useEffect(() => {
    if (status === 'ready' && user?.email) loadLinks();
  }, [status, user?.email, loadLinks]);

  const fetchLinkToken = useCallback(
    (email, force = false) => {
      const busy = linkInflightRef.current.get(email);
      if (busy) return busy;
      const link = linksRef.current.find((l) => l.email === email);
      if (!link) return Promise.reject(new DriveError('Account not linked', { status: 401, reason: 'unauthenticated' }));
      const p = (async () => {
        const { status: code, ok, data } = await workerApi('/api/token', { account: link.id, force });
        if (code === 409) {
          // Google no longer accepts this account's grant: show it as "needs reconnecting".
          linkTokensRef.current.delete(email);
          commitLinks(linksRef.current.map((l) => (l.email === email ? { ...l, needsReconnect: true } : l)));
          throw new DriveError(`Reconnect ${email} to keep using its storage.`, { status: 401, reason: 'reauth' });
        }
        if (!ok) throw new DriveError('Couldn’t get access for a linked account. Please try again.', { status: code, reason: 'network' });
        linkTokensRef.current.set(email, {
          accessToken: data.access_token,
          expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
        });
        return data.access_token;
      })().finally(() => linkInflightRef.current.delete(email));
      linkInflightRef.current.set(email, p);
      return p;
    },
    [workerApi, commitLinks],
  );

  /**
   * Link (or reconnect) an account in a popup. The popup is opened right away
   * (still inside the click, so it isn't blocked), then pointed at the Worker
   * once it has reserved a one-time link request for us.
   */
  const openLink = useCallback(
    async (hint) => {
      setAuthError(null);
      if (linking === 'unavailable') {
        setAuthError('Linking accounts needs the DriveGallery Worker. See the README to set it up.');
        return;
      }
      const w = 520;
      const h = 640;
      const popup = window.open(
        'about:blank',
        'dg-link',
        `popup,width=${w},height=${h},left=${window.screenX + (window.outerWidth - w) / 2},top=${window.screenY + (window.outerHeight - h) / 2}`,
      );
      try {
        const { ok, data } = await workerApi('/api/link/start', { hint });
        if (!ok) throw new Error(data.error || 'Couldn’t start linking. Please try again.');
        const url = `${LINK_API || window.location.origin}/link/go?state=${encodeURIComponent(data.state)}`;
        if (popup && !popup.closed) popup.location.href = url;
        else window.location.assign(url); // popup blocked: do it in this tab instead
      } catch (e) {
        popup?.close();
        setAuthError(e.message);
      }
    },
    [linking, workerApi],
  );

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== LINK_ORIGIN || e.data?.type !== 'dg-link') return;
      if (e.data.error) setAuthError(e.data.error);
      if (e.data.ok) {
        // A reconnected account may have a stale token in memory.
        if (e.data.email) linkTokensRef.current.delete(e.data.email);
        loadLinks();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadLinks]);

  const addAccount = useCallback(() => openLink(), [openLink]);
  const reconnectAccount = useCallback((email) => openLink(email), [openLink]);

  /* ---------------- Sign out / unlink ---------------- */

  const signOut = useCallback(() => {
    googleLogout();
    tokenRef.current = null;
    clearSession();
    settlePending(new DriveError('Signed out', { status: 401, reason: 'unauthenticated' }));
    setSessionExpired(false);
    setUser(null);
    setStatus('signedOut');
    // Linked accounts stay linked in the Worker; just forget them in this tab.
    linkTokensRef.current.clear();
    linkInflightRef.current.clear();
    commitLinks([]);
    setLinking('unknown');
    clearMediaCache();
    resetPool();
  }, [settlePending, commitLinks]);

  /** Unlink a linked account. Its files stay in its own Drive; they just stop showing here. */
  const removeAccount = useCallback(
    async (email) => {
      if (email === userRef.current?.email) return signOut();
      const link = linksRef.current.find((l) => l.email === email);
      if (!link) return;
      const { ok } = await workerApi('/api/unlink', { account: link.id }).catch(() => ({ ok: false }));
      if (!ok) return setAuthError(`Couldn’t unlink ${email}. Please try again.`);
      linkTokensRef.current.delete(email);
      commitLinks(linksRef.current.filter((l) => l.email !== email));
    },
    [signOut, workerApi, commitLinks],
  );

  /* ---------------- Drive client wiring ---------------- */

  // `acct` is an email; no account (or the main one) means the main token.
  const isPrimary = (acct) => !acct || acct === userRef.current?.email;
  const getToken = useCallback(
    async (acct) => {
      if (isPrimary(acct)) return getPrimaryToken();
      const t = linkTokensRef.current.get(acct);
      if (t && Date.now() < t.expiresAt - EXPIRY_MARGIN_MS) return t.accessToken;
      return fetchLinkToken(acct);
    },
    [getPrimaryToken, fetchLinkToken],
  );
  const refreshToken = useCallback((acct) => (isPrimary(acct) ? refreshPrimary() : fetchLinkToken(acct, true)), [refreshPrimary, fetchLinkToken]);
  const usableAccounts = useCallback(() => {
    const main = userRef.current?.email;
    if (!main) return [];
    return [main, ...linksRef.current.filter((l) => !l.needsReconnect).map((l) => l.email)];
  }, []);

  // Hand the token functions to the Drive client. Done during render (not in an
  // effect) so child effects that fire API calls on mount already see them.
  configureDrive({ accounts: usableAccounts, getToken, refreshToken });

  // When the tab comes back after a long sleep, check expiry up front.
  useEffect(() => {
    const onVisible = () => {
      const t = tokenRef.current;
      if (document.visibilityState === 'visible' && t && Date.now() > t.expiresAt - EXPIRY_MARGIN_MS) {
        refreshPrimary().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPrimary]);

  const value = useMemo(() => {
    const accounts = user
      ? [
          { ...user, primary: true, connected: true },
          ...links.map((l) => ({ ...l, primary: false, connected: !l.needsReconnect })),
        ]
      : [];
    return {
      user,
      accounts,
      accountsKey: accounts
        .filter((a) => a.connected)
        .map((a) => a.email)
        .join('|'),
      linkingAvailable: linking !== 'unavailable',
      status,
      authError,
      ready: scriptLoadedSuccessfully,
      sessionExpired,
      signIn,
      signOut,
      continueSession,
      addAccount,
      reconnectAccount,
      removeAccount,
      getToken,
    };
  }, [user, links, linking, status, authError, scriptLoadedSuccessfully, sessionExpired, signIn, signOut, continueSession, addAccount, reconnectAccount, removeAccount, getToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
