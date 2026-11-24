/**
 * DriveGallery linked-accounts Worker.
 *
 * The main sign-in stays in the browser (Google Identity Services token flow).
 * This Worker only exists so *linked* accounts stay linked: a browser-only app
 * gets 1-hour tokens with no refresh token, so every linked account had to be
 * reconnected after each sign-out or closed tab. Here the Worker runs Google's
 * authorization-code flow (with PKCE) for each linked account, keeps its
 * refresh token encrypted in KV, and hands the app short-lived access tokens.
 *
 * Who is asking? Every API call carries the main account's Google access token
 * (`Authorization: Bearer …`). The Worker checks it with Google's tokeninfo
 * endpoint, requires that it was issued to *this app's* OAuth client, and uses
 * the account's stable `sub` as the owner of the links. No sessions or cookies
 * of our own, and nothing to do with the main sign-in itself.
 *
 * Routes
 *   POST /api/link/start  { hint? }      → { state }   (bearer)  begin linking
 *   GET  /link/go?state=…                → Google      (opened in the popup)
 *   GET  /link/callback                  ← Google      (finishes in the popup)
 *   GET  /api/links                      → { accounts } (bearer)
 *   POST /api/token       { account, force? } → access token for a linked account (bearer)
 *   POST /api/unlink      { account }    → unlink and revoke (bearer)
 *
 * KV layout (binding DG_KV)
 *   links:{owner}            [{ id, email, name, picture, needsReconnect }]
 *   tok:{owner}:{acct}       AES-GCM encrypted refresh token
 *   at:{owner}:{acct}        cached access token { token, expiresAt }
 *   bearer:{sha256(token)}   owner sub for a verified main-account token (until it expires)
 *   link:{state}             { owner, verifier, hint, consent }   (10 minutes)
 *
 * Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_KEY (base64, 32 bytes).
 * Vars:    APP_ORIGINS   optional; comma-separated origins of the app. Unset or "*" allows any origin
 *          WORKER_ORIGIN optional; overrides this Worker's public origin for the
 *                        redirect URI (local dev behind the Vite proxy)
 */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `openid email profile ${DRIVE_SCOPE}`;

const STATE_COOKIE = 'dg_link';
const STATE_TTL = 600; // 10 minutes to finish the Google screens
const MAX_LINKED = 9; // plus the main account = 10

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const appOrigins = String(env.APP_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
    // Unset or "*": accept any origin. Safe for this API because it authenticates
    // with a bearer token checked against Google, never with cookies.
    const allowAll = !appOrigins.length || appOrigins.includes('*');
    const ctx = {
      allowAll,
      request,
      env,
      url,
      appOrigins,
      self: (env.WORKER_ORIGIN || url.origin).replace(/\/$/, ''),
      cors: corsHeaders(request, allowAll ? null : appOrigins),
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ctx.cors });
    // Name (never reveal) whatever setting is missing, to make setup mistakes easy to spot.
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_KEY', 'DG_KV'].filter((k) => !env[k]);
    if (missing.length) return json(ctx, { error: 'not_configured', missing }, 503);

    try {
      const { pathname } = url;
      const m = request.method;
      if (m === 'GET' && pathname === '/link/go') return await linkGo(ctx);
      if (m === 'GET' && pathname === '/link/callback') return await linkCallback(ctx);
      if (m === 'POST' && pathname === '/api/link/start') return await withOwner(ctx, linkStart);
      if (m === 'GET' && pathname === '/api/links') return await withOwner(ctx, listLinks);
      if (m === 'POST' && pathname === '/api/token') return await withOwner(ctx, token);
      if (m === 'POST' && pathname === '/api/unlink') return await withOwner(ctx, unlink);
      return json(ctx, { error: 'not_found' }, 404);
    } catch (e) {
      console.error(e);
      return json(ctx, { error: 'server_error' }, 500);
    }
  },
};

/* ------------------------------------------------------------------------ */
/* Who is the main account?                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Verify the main account's Google access token and run `fn` with its `sub`.
 * Results are cached by token hash until the token expires, so Google's
 * tokeninfo endpoint is hit about once an hour per signed-in user.
 */
async function withOwner(ctx, fn) {
  const auth = ctx.request.headers.get('Authorization') || '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!accessToken) return json(ctx, { error: 'unauthenticated' }, 401);

  const cacheKey = `bearer:${await sha256b64url(accessToken)}`;
  let owner = await ctx.env.DG_KV.get(cacheKey);
  if (!owner) {
    const res = await fetch(`${GOOGLE_TOKENINFO}?access_token=${encodeURIComponent(accessToken)}`);
    const info = await res.json().catch(() => ({}));
    // The token must belong to this app's OAuth client, not just any Google app.
    if (!res.ok || !info.sub || (info.aud !== ctx.env.GOOGLE_CLIENT_ID && info.azp !== ctx.env.GOOGLE_CLIENT_ID)) {
      return json(ctx, { error: 'unauthenticated' }, 401);
    }
    owner = info.sub;
    await ctx.env.DG_KV.put(cacheKey, owner, { expirationTtl: Math.max(60, Number(info.expires_in || 60)) });
  }
  return fn(ctx, owner);
}

/* ------------------------------------------------------------------------ */
/* Linking                                                                   */
/* ------------------------------------------------------------------------ */

/** Step 1 (from the app, with the bearer): reserve a one-time state for this owner. */
async function linkStart(ctx, owner) {
  const { hint } = await readJson(ctx.request);
  const links = await getLinks(ctx.env, owner);
  if (!links.some((l) => l.email === hint) && links.length >= MAX_LINKED) {
    return json(ctx, { error: `You can link up to ${MAX_LINKED} extra accounts.` }, 400);
  }
  const state = randomId();
  const rec = { owner, hint: typeof hint === 'string' ? hint : '', verifier: randomId(48), consent: false };
  await ctx.env.DG_KV.put(`link:${state}`, JSON.stringify(rec), { expirationTtl: STATE_TTL });
  return json(ctx, { state });
}

/**
 * Step 2 (the popup navigates here): tie the state to this browser with a
 * cookie, then go to Google. The cookie stops someone from completing a link
 * started in another browser.
 */
async function linkGo(ctx) {
  const state = ctx.url.searchParams.get('state') || '';
  const rec = state && (await ctx.env.DG_KV.get(`link:${state}`, 'json'));
  if (!rec) return finishPage(ctx, { error: 'This link request expired. Please try again.' });
  return redirectToGoogle(ctx, state, rec);
}

async function redirectToGoogle(ctx, state, rec) {
  const params = new URLSearchParams({
    client_id: ctx.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${ctx.self}/link/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline', // ask for a refresh token
    include_granted_scopes: 'true',
    state,
    code_challenge: await sha256b64url(rec.verifier),
    code_challenge_method: 'S256',
    // Google only issues a refresh token on consent; force it when we're missing one.
    prompt: rec.consent ? 'consent select_account' : 'select_account',
  });
  if (rec.hint) params.set('login_hint', rec.hint);
  return new Response(null, {
    status: 302,
    headers: { Location: `${GOOGLE_AUTH}?${params}`, 'Set-Cookie': cookie(ctx, STATE_COOKIE, state, STATE_TTL) },
  });
}

/** Step 3 (Google redirects the popup here): store the refresh token, report back. */
async function linkCallback(ctx) {
  const { url, env } = ctx;
  const state = url.searchParams.get('state') || '';
  const rec = state && readCookie(ctx.request, STATE_COOKIE) === state ? await env.DG_KV.get(`link:${state}`, 'json') : null;
  if (!rec) return finishPage(ctx, { error: 'Linking expired or was started in another browser. Please try again.' });
  await env.DG_KV.delete(`link:${state}`);

  const googleError = url.searchParams.get('error');
  if (googleError) {
    return finishPage(ctx, googleError === 'access_denied' ? { cancelled: true } : { error: `Google sign-in failed (${googleError}).` });
  }

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${ctx.self}/link/callback`,
      grant_type: 'authorization_code',
      code_verifier: rec.verifier,
    }),
  });
  const tok = await res.json();
  if (!res.ok) return finishPage(ctx, { error: 'Google sign-in failed. Please try again.' });
  if (!String(tok.scope || '').split(' ').includes(DRIVE_SCOPE)) {
    return finishPage(ctx, { error: 'DriveGallery needs permission to manage the files it creates in that account’s Drive.' });
  }

  const info = await (await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
  if (!info.sub || !info.email) return finishPage(ctx, { error: 'Couldn’t read that Google profile.' });
  if (info.sub === rec.owner) return finishPage(ctx, { error: 'That’s the account you’re signed in with. Pick a different one to link.' });

  const links = await getLinks(env, rec.owner);
  const existing = links.find((l) => l.id === info.sub);
  if (!existing && links.length >= MAX_LINKED) return finishPage(ctx, { error: `You can link up to ${MAX_LINKED} extra accounts.` });

  // Keep the refresh token. If Google didn't send one (the account consented
  // before) and we don't hold a usable one, go round again with consent.
  const tokKey = `tok:${rec.owner}:${info.sub}`;
  if (tok.refresh_token) {
    await env.DG_KV.put(tokKey, await encrypt(env, tok.refresh_token, tokKey));
  } else if (!(await env.DG_KV.get(tokKey)) || existing?.needsReconnect) {
    if (rec.consent) return finishPage(ctx, { error: 'Google didn’t grant offline access. Please try again.' });
    const retry = randomId();
    const next = { ...rec, hint: info.email, consent: true };
    await env.DG_KV.put(`link:${retry}`, JSON.stringify(next), { expirationTtl: STATE_TTL });
    return redirectToGoogle(ctx, retry, next);
  }
  await cacheAccessToken(env, rec.owner, info.sub, tok.access_token, tok.expires_in);

  const entry = { id: info.sub, email: info.email, name: info.name || info.email, picture: info.picture || null, needsReconnect: false };
  const next = existing ? links.map((l) => (l.id === entry.id ? entry : l)) : [...links, entry];
  await env.DG_KV.put(`links:${rec.owner}`, JSON.stringify(next));
  return finishPage(ctx, { email: entry.email });
}

/**
 * Last page of the popup: post the result to the app and close. Without an
 * opener (popup blocked, so the app navigated instead) go back to the app.
 */
function finishPage(ctx, result) {
  const msg = { type: 'dg-link', ok: !result.error && !result.cancelled, ...result };
  const payload = JSON.stringify(msg).replace(/</g, '\\u003c');
  const html = `<!doctype html><meta charset="utf-8"><title>DriveGallery</title>
<p style="font:15px system-ui;padding:24px">${result.error ? escapeHtml(result.error) : 'Done. You can close this window.'}</p>
<script>
  const msg = ${payload};
  const origins = ${JSON.stringify(ctx.allowAll ? ['*'] : ctx.appOrigins)};
  if (window.opener) { for (const o of origins) { try { window.opener.postMessage(msg, o); } catch (e) {} } window.close(); }
  else if (origins[0] !== '*') location.replace(origins[0] + '/');
</script>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': cookie(ctx, STATE_COOKIE, '', 0),
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}

/* ------------------------------------------------------------------------ */
/* API                                                                       */
/* ------------------------------------------------------------------------ */

async function listLinks(ctx, owner) {
  const links = await getLinks(ctx.env, owner);
  return json(ctx, { accounts: links.map(({ id, email, name, picture, needsReconnect }) => ({ id, email, name, picture, needsReconnect: Boolean(needsReconnect) })) });
}

async function token(ctx, owner) {
  const { env } = ctx;
  const { account, force } = await readJson(ctx.request);
  const links = await getLinks(env, owner);
  const link = links.find((l) => l.id === account);
  if (!link) return json(ctx, { error: 'unknown_account' }, 404);
  if (link.needsReconnect) return json(ctx, { error: 'reauth', email: link.email }, 409);

  if (!force) {
    const cached = await env.DG_KV.get(`at:${owner}:${account}`, 'json');
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) {
      return json(ctx, { access_token: cached.token, expires_in: Math.floor((cached.expiresAt - Date.now()) / 1000) });
    }
  }

  // Missing, or unreadable (e.g. TOKEN_KEY was rotated): the user has to reconnect.
  const tokKey = `tok:${owner}:${account}`;
  const stored = await env.DG_KV.get(tokKey);
  const refresh = stored && (await decrypt(env, stored, tokKey).catch(() => null));
  if (!refresh) return markReconnect(ctx, owner, links, account);

  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok) {
    // Revoked access, password change, or the 7-day expiry of apps in Testing mode.
    if (tok.error === 'invalid_grant') return markReconnect(ctx, owner, links, account);
    return json(ctx, { error: 'google_error' }, 502);
  }
  await cacheAccessToken(env, owner, account, tok.access_token, tok.expires_in);
  return json(ctx, { access_token: tok.access_token, expires_in: tok.expires_in });
}

async function markReconnect(ctx, owner, links, account) {
  const next = links.map((l) => (l.id === account ? { ...l, needsReconnect: true } : l));
  await ctx.env.DG_KV.put(`links:${owner}`, JSON.stringify(next));
  await ctx.env.DG_KV.delete(`at:${owner}:${account}`);
  return json(ctx, { error: 'reauth', email: next.find((l) => l.id === account)?.email }, 409);
}

async function unlink(ctx, owner) {
  const { env } = ctx;
  const { account } = await readJson(ctx.request);
  const links = await getLinks(env, owner);
  if (!links.some((l) => l.id === account)) return json(ctx, { error: 'unknown_account' }, 404);

  const tokKey = `tok:${owner}:${account}`;
  const stored = await env.DG_KV.get(tokKey);
  const refresh = stored && (await decrypt(env, stored, tokKey).catch(() => null));
  // Best effort: tell Google to drop the grant too.
  if (refresh) await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {});

  await Promise.all([env.DG_KV.delete(tokKey), env.DG_KV.delete(`at:${owner}:${account}`)]);
  await env.DG_KV.put(`links:${owner}`, JSON.stringify(links.filter((l) => l.id !== account)));
  return json(ctx, { ok: true });
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

async function getLinks(env, owner) {
  return (await env.DG_KV.get(`links:${owner}`, 'json')) || [];
}

async function cacheAccessToken(env, owner, account, accessToken, expiresIn) {
  const ttl = Number(expiresIn || 3600);
  await env.DG_KV.put(`at:${owner}:${account}`, JSON.stringify({ token: accessToken, expiresAt: Date.now() + ttl * 1000 }), {
    expirationTtl: Math.max(60, ttl),
  });
}

/** CORS for the app's origin(s). The API authenticates with a bearer token, so no credentials/cookies are allowed cross-origin. */
function corsHeaders(request, appOrigins) {
  const origin = request.headers.get('Origin');
  if (!origin || (appOrigins && !appOrigins.includes(origin))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(ctx, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...ctx.cors },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function cookie(ctx, name, value, maxAge) {
  // Secure everywhere except plain-http localhost during development.
  const secure = ctx.self.startsWith('https://') ? '; Secure' : '';
  return `${name}=${value}; Path=/link; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

function randomId(n = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

async function sha256b64url(s) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

let keyPromise = null;
function aesKey(env) {
  if (!keyPromise) {
    const raw = fromB64(env.TOKEN_KEY);
    if (raw.length !== 32) throw new Error('TOKEN_KEY must be 32 bytes, base64-encoded');
    keyPromise = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return keyPromise;
}

/** AES-GCM; the KV key is bound in as associated data so ciphertexts can't be swapped between entries. */
async function encrypt(env, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, await aesKey(env), new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

async function decrypt(env, stored, aad) {
  const bytes = fromB64(stored);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(aad) },
    await aesKey(env),
    bytes.slice(12),
  );
  return new TextDecoder().decode(pt);
}
