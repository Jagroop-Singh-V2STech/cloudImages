/**
 * Google Drive API v3 client for DriveGallery.
 *
 * Everything runs in the browser. Every request carries an OAuth access token
 * in the Authorization header. When Drive answers 401 (token expired or
 * revoked), we ask the auth layer for a fresh token and replay the request once.
 *
 * Scope note: the app requests `drive.file`, so Drive only lets it see files and
 * folders that it created itself (or that the user opened with it). The user's
 * other Drive content stays invisible to it, which is why every query is scoped
 * to the "DriveGallery" root folder that the app creates.
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const ROOT_FOLDER_NAME = 'DriveGallery';

// Fields we need for every item we render. Asking only for what we use keeps
// responses small (Drive returns a minimal set unless `fields` is specified).
export const FILE_FIELDS =
  'id,name,mimeType,size,quotaBytesUsed,createdTime,modifiedTime,parents,' +
  'thumbnailLink,hasThumbnail,iconLink,webViewLink,' +
  'imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)';

/* ------------------------------------------------------------------------ */
/* Token plumbing                                                            */
/* ------------------------------------------------------------------------ */

let tokenProvider = {
  accounts: () => [],
  getToken: async () => null,
  refreshToken: async () => {
    throw new DriveError('Not signed in', { status: 401, reason: 'unauthenticated' });
  },
};

/**
 * Wired up by AuthProvider. Accounts are identified by email.
 *   accounts()          → connected accounts, primary first
 *   getToken(acct)      → a valid token (refreshing proactively near expiry)
 *   refreshToken(acct)  → forces a new token; resolves once the user
 *                         (silently or via the "Session expired" prompt) has one
 */
export function configureDrive(provider) {
  tokenProvider = provider;
}

const connectedAccounts = () => tokenProvider.accounts();
const primaryAccount = () => connectedAccounts()[0];

/* ------------------------------------------------------------------------ */
/* Errors                                                                    */
/* ------------------------------------------------------------------------ */

export class DriveError extends Error {
  constructor(message, { status = 0, reason = 'unknown', cause } = {}) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.reason = reason;
    this.cause = cause;
  }
}

export function isAbortError(err) {
  return err?.name === 'AbortError' || err?.reason === 'aborted';
}

export const STORAGE_UPGRADE_URL = 'https://one.google.com/storage';

/** Human-friendly message for any error thrown by this module. */
export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  switch (err.reason) {
    case 'storageQuotaExceeded':
    case 'quotaExceeded':
      return 'Your Google storage is full. Link another Google account, free up space, or upgrade your plan to keep uploading.';
    case 'rateLimitExceeded':
    case 'userRateLimitExceeded':
      return 'Google Drive is rate-limiting requests. Please wait a moment and try again.';
    case 'notFound':
      return 'That item no longer exists. It may have been moved or deleted.';
    case 'insufficientPermissions':
    case 'appNotAuthorizedToFile':
      return 'DriveGallery doesn’t have permission for that item.';
    case 'network':
      return 'Network error. Check your connection and try again.';
    case 'unauthenticated':
      return 'Your session has ended. Please sign in again.';
    case 'reauth':
      return err.message;
    default:
      return err.message || 'Something went wrong.';
  }
}

async function parseError(res) {
  let reason = res.status === 404 ? 'notFound' : 'http_' + res.status;
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    const e = body?.error;
    if (e) {
      message = e.message || message;
      reason = e.errors?.[0]?.reason || e.status || reason;
    }
  } catch {
    /* non-JSON error body */
  }
  return new DriveError(message, { status: res.status, reason });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err) {
  return (
    err.status === 429 ||
    err.status >= 500 ||
    err.reason === 'rateLimitExceeded' ||
    err.reason === 'userRateLimitExceeded'
  );
}

/* ------------------------------------------------------------------------ */
/* Core request helper                                                       */
/* ------------------------------------------------------------------------ */

/**
 * fetch() wrapper used by every API call:
 *  - injects the Authorization header
 *  - on 401, refreshes the token and retries once
 *  - retries 429 / 5xx / rate-limit errors with exponential backoff
 *  - converts Drive's JSON error envelope into a DriveError
 */
export async function driveFetch(url, { acct, method = 'GET', headers = {}, body, signal, raw = false } = {}) {
  acct = acct || primaryAccount();
  let refreshed = false;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const token = await tokenProvider.getToken(acct);
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        signal,
        headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch (e) {
      if (isAbortError(e)) throw e;
      throw new DriveError('Network error', { reason: 'network', cause: e });
    }

    if (res.ok) {
      if (raw) return res;
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await tokenProvider.refreshToken(acct);
      continue;
    }

    const err = await parseError(res);
    if (isRetryable(err) && attempt < 4) {
      attempt += 1;
      await sleep(2 ** attempt * 250 + Math.random() * 250);
      continue;
    }
    throw err;
  }
}

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

/** Escape a value for use inside a single-quoted Drive query string. */
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/* ------------------------------------------------------------------------ */
/* Storage pool                                                              */
/* ------------------------------------------------------------------------ */

/*
 * Several Google accounts can be linked and used as one storage pool. Each
 * account has its own "DriveGallery" root folder, and the UI shows them merged:
 *
 *  - Files live in exactly one account. `fileAccount` remembers which one, so
 *    rename/move/delete/download go to the right account by file id alone.
 *  - Folders with the same name at the same place in different accounts are
 *    one *folder group*. The UI only ever sees the group's key (the id of the
 *    first member we saw); `groups` maps it to the real id in each account.
 *    Listing a group lists every member and merges the results.
 *  - A folder only gets created in another account when something is uploaded
 *    or moved there (`ensureFolderIn`).
 *
 * Every file object handed to the UI passes through `tag()`, which rewrites
 * folder ids and `parents` to group keys and records the owning account in
 * `_acct`.
 */

const fileAccount = new Map(); // file id → account
const groups = new Map(); // group key → { name, parent: key|null, ids: { [acct]: id }, checked: Set<acct> }
const alias = new Map(); // real folder id (any account) → group key
const childIndex = new Map(); // `${parentKey}/${name}` → group key
let rootKey = null;

const childKey = (parentKey, name) => `${parentKey}/${name}`;

/** Join a real folder (in `acct`) to its group, creating the group if needed. */
function linkFolder(folder, acct, parentKey) {
  let key = alias.get(folder.id);
  if (!key && parentKey) key = childIndex.get(childKey(parentKey, folder.name));
  if (!key) {
    key = folder.id;
    groups.set(key, { name: folder.name, parent: parentKey || null, ids: {}, checked: new Set() });
  }
  const g = groups.get(key);
  // A parent that is a known group beats a raw id we may have recorded earlier.
  if (parentKey && groups.has(parentKey) && !groups.has(g.parent)) g.parent = parentKey;
  if (g.parent) childIndex.set(childKey(g.parent, g.name), key);
  g.ids[acct] = folder.id;
  g.checked.add(acct);
  alias.set(folder.id, key);
  return key;
}

/** Normalise a Drive file from `acct` for the UI (see the comment above). */
function tag(file, acct) {
  if (!file) return file;
  const parents = (file.parents || []).map((p) => alias.get(p) || p);
  if (file.mimeType === FOLDER_MIME) {
    const key = linkFolder(file, acct, parents[0]);
    return { ...file, id: key, parents, _acct: acct };
  }
  fileAccount.set(file.id, acct);
  return { ...file, parents, _acct: acct };
}

const accountOf = (fileId) => fileAccount.get(fileId) || primaryAccount();

/**
 * Make sure we know, for every connected account, whether this folder group
 * exists there (and its id if it does). Looks missing members up by name under
 * the parent's member in that account.
 */
async function resolveGroup(key, signal) {
  const g = groups.get(key);
  if (!g) return null;
  for (const acct of connectedAccounts()) {
    if (g.ids[acct] || g.checked.has(acct)) continue;
    const parent = g.parent && (await resolveGroup(g.parent, signal));
    const parentId = parent?.ids[acct];
    if (parentId) {
      const found = await findFolder(acct, g.name, parentId, signal);
      if (found) {
        g.ids[acct] = found.id;
        alias.set(found.id, key);
      }
    }
    g.checked.add(acct);
  }
  return g;
}

/** Real id of folder group `key` in `acct`, creating it (and its parents) if needed. */
async function ensureFolderIn(key, acct) {
  const g = await resolveGroup(key);
  if (!g) return key; // not a group: a raw folder id, use as is
  if (g.ids[acct]) return g.ids[acct];
  if (!g.parent) throw new DriveError('DriveGallery folder missing in linked account', { reason: 'notFound' });
  const parentId = await ensureFolderIn(g.parent, acct);
  const created = await driveFetch(`${API}/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    acct,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: g.name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  g.ids[acct] = created.id;
  g.checked.add(acct);
  alias.set(created.id, key);
  return created.id;
}

/** Real (account, id) pairs behind a UI id: every member for a folder group, one for a file. */
async function membersOf(id) {
  const g = await resolveGroup(id);
  if (g) return Object.entries(g.ids).map(([acct, realId]) => ({ acct, id: realId }));
  return [{ acct: accountOf(id), id }];
}

/** Forget everything (sign-out). */
export function resetPool() {
  fileAccount.clear();
  groups.clear();
  alias.clear();
  childIndex.clear();
  quotas.clear();
  reserved.clear();
  rootKey = null;
  rootFolderPromise = null;
  syncPromise = null;
}

/** Kept for older callers. */
export const resetRootFolder = resetPool;

/**
 * Bring the pool in line with the connected accounts after one is linked or
 * disconnected: find/create the root folder in new accounts and drop members
 * from accounts that are gone.
 */
let syncPromise = null;
export function syncPoolAccounts() {
  const run = async () => {
    const root = groups.get(rootKey);
    if (!root) return;
    const accts = connectedAccounts();
    const live = new Set(accts);
    for (const g of groups.values()) {
      for (const acct of Object.keys(g.ids)) if (!live.has(acct)) delete g.ids[acct];
      for (const acct of [...g.checked]) if (!live.has(acct)) g.checked.delete(acct);
    }
    for (const [id, acct] of fileAccount) if (!live.has(acct)) fileAccount.delete(id);
    for (const acct of [...quotas.keys()]) if (!live.has(acct)) quotas.delete(acct);
    await Promise.all(
      accts
        .filter((acct) => !root.ids[acct])
        .map(async (acct) => {
          try {
            const r = await lookupOrCreateRoot(acct);
            root.ids[acct] = r.id;
            alias.set(r.id, rootKey);
          } catch {
            /* that account just won't contribute until the next sync */
          }
          root.checked.add(acct);
        }),
    );
  };
  syncPromise = (syncPromise || Promise.resolve()).then(run, run);
  return syncPromise;
}

/* ------------------------------------------------------------------------ */
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

/** Profile of the main account (called right after sign-in). */
export async function getUserInfo() {
  return driveFetch('https://www.googleapis.com/oauth2/v3/userinfo');
}

const quotas = new Map(); // acct → { limit, usage }
const reserved = new Map(); // acct → bytes of uploads in flight

/**
 * about.get for every account (Drive requires an explicit `fields` mask).
 * Returns the pooled totals plus a per-account breakdown.
 */
export async function getQuota() {
  const accts = connectedAccounts();
  const list = await Promise.all(
    accts.map(async (acct) => {
      try {
        const data = await driveFetch(`${API}/about?fields=storageQuota`, { acct });
        const q = data.storageQuota || {};
        const entry = {
          account: acct,
          // `limit` is absent for accounts with unlimited storage.
          limit: q.limit ? Number(q.limit) : null,
          usage: Number(q.usage || 0),
          usageInDrive: Number(q.usageInDrive || 0),
          usageInDriveTrash: Number(q.usageInDriveTrash || 0),
        };
        quotas.set(acct, entry);
        return entry;
      } catch (e) {
        if (acct === accts[0]) throw e;
        return null;
      }
    }),
  );
  const ok = list.filter(Boolean);
  const sum = (k) => ok.reduce((s, q) => s + (q[k] || 0), 0);
  return {
    limit: ok.some((q) => q.limit == null) ? null : sum('limit'),
    usage: sum('usage'),
    usageInDrive: sum('usageInDrive'),
    usageInDriveTrash: sum('usageInDriveTrash'),
    accounts: ok,
  };
}

function freeSpace(acct) {
  const q = quotas.get(acct);
  if (!q || q.limit == null) return Infinity; // unknown or unlimited: worth a try
  return q.limit - q.usage - (reserved.get(acct) || 0);
}

/** First account (primary first) with room for `bytes`, skipping `exclude`. */
export function pickUploadAccount(bytes, exclude = new Set()) {
  return connectedAccounts().find((acct) => !exclude.has(acct) && freeSpace(acct) >= bytes) || null;
}

/* ------------------------------------------------------------------------ */
/* Folders & listing                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Find the app's root folder in every connected account, creating it on
 * first use, and join them into the pool's root group.
 *
 * Because of the drive.file scope the lookup can only ever match a folder the
 * app created itself, so a user's own unrelated "DriveGallery" folder is never
 * picked up by mistake. `'root' in parents` limits it to the top of My Drive.
 */
let rootFolderPromise = null;

export function findOrCreateRootFolder() {
  // Single-flight: concurrent callers (e.g. React StrictMode double-mounting)
  // share one lookup, otherwise both could miss and create two root folders.
  if (!rootFolderPromise) {
    rootFolderPromise = setupRoots().catch((e) => {
      rootFolderPromise = null;
      throw e;
    });
  }
  return rootFolderPromise;
}

async function setupRoots() {
  const accts = connectedAccounts();
  const roots = await Promise.all(
    accts.map((acct, i) =>
      lookupOrCreateRoot(acct).catch((e) => {
        if (i === 0) throw e; // the primary account must work
        return null;
      }),
    ),
  );
  const primary = roots[0];
  rootKey = primary.id;
  groups.set(rootKey, { name: primary.name, parent: null, ids: {}, checked: new Set(accts) });
  roots.forEach((r, i) => {
    if (!r) return;
    groups.get(rootKey).ids[accts[i]] = r.id;
    alias.set(r.id, rootKey);
  });
  return { ...primary, id: rootKey, parents: [], _acct: accts[0] };
}

async function lookupOrCreateRoot(acct) {
  const q = `name='${esc(ROOT_FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`;
  const data = await driveFetch(
    `${API}/files?${qs({ q, fields: `files(${FILE_FIELDS})`, orderBy: 'createdTime', pageSize: 1, spaces: 'drive' })}`,
    { acct },
  );
  if (data.files?.length) return data.files[0];
  return driveFetch(`${API}/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    acct,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }),
  });
}

async function findFolder(acct, name, parentId, signal) {
  const q = `'${esc(parentId)}' in parents and name='${esc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const data = await driveFetch(`${API}/files?${qs({ q, fields: 'files(id,name)', orderBy: 'createdTime', pageSize: 1 })}`, {
    acct,
    signal,
  });
  return data.files?.[0] || null;
}

/** New folders go in the primary account; other accounts get it on demand. */
export async function createFolder(name, parentId) {
  const acct = primaryAccount();
  const parent = await ensureFolderIn(parentId, acct);
  const f = await driveFetch(`${API}/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    acct,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  return tag(f, acct);
}

const SORT_KEYS = {
  name: 'name_natural',
  date: 'modifiedTime',
  size: 'quotaBytesUsed',
};

/** Tag a batch from several accounts, merging folder groups that show up more than once. */
function mergeTagged(batches) {
  const seen = new Set();
  const out = [];
  for (const { acct, files } of batches) {
    for (const f of files || []) {
      const t = tag(f, acct);
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/**
 * List one page of a folder (or search across the whole app), across every
 * account in the pool.
 *
 * Drive search query syntax: https://developers.google.com/drive/api/guides/search-files
 *   "'FOLDER_ID' in parents"   → direct children of that folder only (not recursive)
 *   "trashed=false"            → hide items the user moved to the trash
 *   "mimeType contains 'image/'" → MIME prefix match for the type filter
 *   "name contains 'foo'"       → prefix/word match on the file name (case-insensitive)
 *
 * orderBy starts with `folder` so folders are grouped before files on every
 * page; without it a folder could show up on page 3 between two photos.
 *
 * Each account pages independently, so `nextPageToken` here is a JSON map of
 * account → that account's Drive pageToken. Callers sort the merged list.
 */
export async function listFiles({ folderId, search, filter = 'all', sort = 'name', direction = 'asc', pageToken, pageSize = 60, signal }) {
  const base = ['trashed=false'];
  if (search) base.push(`name contains '${esc(search)}'`);
  if (filter === 'images') base.push(`(mimeType contains 'image/' or mimeType='${FOLDER_MIME}')`);
  else if (filter === 'videos') base.push(`(mimeType contains 'video/' or mimeType='${FOLDER_MIME}')`);
  else base.push(`(mimeType contains 'image/' or mimeType contains 'video/' or mimeType='${FOLDER_MIME}')`);

  // A search spans all of DriveGallery in every account. drive.file already
  // limits results to files the app created, so no parent clause is needed.
  let targets = search ? connectedAccounts().map((acct) => ({ acct })) : await membersOf(folderId);
  if (pageToken) {
    const tokens = JSON.parse(pageToken);
    targets = targets.filter((t) => tokens[t.acct]).map((t) => ({ ...t, pageToken: tokens[t.acct] }));
  }

  const key = SORT_KEYS[sort] || 'name_natural';
  const orderBy = `folder,${key}${direction === 'desc' ? ' desc' : ''}`;

  const pages = await Promise.all(
    targets.map(async (t) => {
      const clauses = t.id ? [...base, `'${esc(t.id)}' in parents`] : base;
      const data = await driveFetch(
        `${API}/files?${qs({
          q: clauses.join(' and '),
          orderBy,
          pageSize,
          pageToken: t.pageToken,
          spaces: 'drive',
          fields: `nextPageToken,files(${FILE_FIELDS})`,
        })}`,
        { acct: t.acct, signal },
      );
      return { acct: t.acct, files: data.files, next: data.nextPageToken };
    }),
  );

  const next = Object.fromEntries(pages.filter((p) => p.next).map((p) => [p.acct, p.next]));
  return { files: mergeTagged(pages), nextPageToken: Object.keys(next).length ? JSON.stringify(next) : null };
}

/** All direct sub-folders of a folder (used by the sidebar and MoveDialog). */
export async function listSubfolders(parentId, { signal } = {}) {
  const members = await membersOf(parentId);
  const batches = await Promise.all(
    members.map(async ({ acct, id }) => {
      const files = [];
      let pageToken;
      do {
        const data = await driveFetch(
          `${API}/files?${qs({
            q: `'${esc(id)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
            orderBy: 'name_natural',
            pageSize: 200,
            pageToken,
            fields: `nextPageToken,files(${FILE_FIELDS})`,
          })}`,
          { acct, signal },
        );
        files.push(...(data.files || []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return { acct, files };
    }),
  );
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return mergeTagged(batches).sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Metadata for a file or folder group. If we don't know which account a file
 * is in (e.g. a favorite saved in an earlier session), try each in turn.
 */
export async function getFile(fileId) {
  const url = (id) => `${API}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`;
  const g = groups.get(fileId);
  if (g) {
    const [acct, id] = Object.entries(g.ids)[0] || [];
    if (acct) return tag(await driveFetch(url(id), { acct }), acct);
  }
  const known = fileAccount.get(fileId);
  const order = known ? [known] : connectedAccounts();
  let lastErr;
  for (const acct of order) {
    try {
      return tag(await driveFetch(url(fileId), { acct }), acct);
    } catch (e) {
      if (isAbortError(e) || ![403, 404].includes(e.status)) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new DriveError('Not found', { status: 404, reason: 'notFound' });
}

/**
 * Breadcrumb path [root, ..., folder] for a folder group. Uses the groups we
 * already know; otherwise walks up the real `parents` chain in the folder's
 * account (e.g. after a search) and links each step into the pool.
 */
export async function getFolderPath(folderId, rootId) {
  const chain = [];
  for (let k = folderId, depth = 0; k && depth < 32; depth++) {
    const g = groups.get(k);
    if (!g) break;
    chain.unshift({ id: k, name: g.name });
    if (k === rootId) return chain;
    k = g.parent;
  }

  const g0 = groups.get(folderId);
  const [acct, startId] = g0 ? Object.entries(g0.ids)[0] || [] : [primaryAccount(), folderId];
  const rootId_ = groups.get(rootId)?.ids[acct];
  if (!acct || !rootId_) return null;
  const raws = [];
  let id = startId;
  for (let depth = 0; id && depth < 32; depth++) {
    if (id === rootId_) {
      const path = [{ id: rootId, name: groups.get(rootId).name }];
      let parentKey = rootId;
      for (const f of raws) {
        parentKey = linkFolder(f, acct, parentKey);
        path.push({ id: parentKey, name: f.name });
      }
      return path;
    }
    const f = await driveFetch(`${API}/files/${id}?fields=id,name,parents`, { acct });
    raws.unshift(f);
    id = f.parents?.[0];
  }
  // Fell off the top without meeting the root: the folder lives outside the app.
  return null;
}

/* ------------------------------------------------------------------------ */
/* Update                                                                    */
/* ------------------------------------------------------------------------ */

/** Rename a file, or every member of a folder group so they stay merged. */
export async function renameFile(fileId, name) {
  const members = await membersOf(fileId);
  const results = await Promise.all(
    members.map(({ acct, id }) =>
      driveFetch(`${API}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
        acct,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    ),
  );
  const g = groups.get(fileId);
  if (g) {
    if (g.parent) childIndex.delete(childKey(g.parent, g.name));
    g.name = name;
    if (g.parent) childIndex.set(childKey(g.parent, name), fileId);
  }
  return tag(results[0], members[0].acct);
}

/**
 * Move a file or folder.
 *
 * Drive has no "move" endpoint and `parents` isn't writable in the request
 * body. Instead you PATCH the file with two query parameters:
 *   addParents=NEW_PARENT_ID        → link the item under the new folder
 *   removeParents=OLD_ID1,OLD_ID2   → unlink it from its current folder(s)
 * Doing both in one request makes the move atomic. Since 2020 a file can only
 * have one parent, so removeParents is effectively the single current parent.
 *
 * In the pool, a file moves inside its own account (the target folder is
 * created there if needed); a folder group moves every member.
 */
export async function moveFile(fileId, newParentId, oldParents = []) {
  const members = await membersOf(fileId);
  const results = [];
  for (const { acct, id } of members) {
    const target = await ensureFolderIn(newParentId, acct);
    const old = oldParents.map((p) => groups.get(p)?.ids[acct] || p).filter((p) => !groups.has(p) || groups.get(p).ids[acct] === p);
    results.push(
      await driveFetch(
        `${API}/files/${id}?${qs({
          addParents: target,
          removeParents: old.join(','),
          fields: FILE_FIELDS,
        })}`,
        { acct, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      ),
    );
  }
  const g = groups.get(fileId);
  if (g) {
    if (g.parent) childIndex.delete(childKey(g.parent, g.name));
    g.parent = newParentId;
    childIndex.set(childKey(newParentId, g.name), fileId);
  }
  return tag(results[0], members[0].acct);
}

/** "Delete" = move to the Drive trash; the user can still recover it for 30 days. */
export async function trashFile(fileId) {
  const members = await membersOf(fileId);
  await Promise.all(
    members.map(({ acct, id }) =>
      driveFetch(`${API}/files/${id}?fields=id`, {
        acct,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      }),
    ),
  );
  return { id: fileId };
}

export async function restoreFile(fileId) {
  const members = await membersOf(fileId);
  const results = await Promise.all(
    members.map(({ acct, id }) =>
      driveFetch(`${API}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
        acct,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: false }),
      }),
    ),
  );
  return tag(results[0], members[0].acct);
}

/* ------------------------------------------------------------------------ */
/* Download & media                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Download file content as a Blob. Drive files are private, so a plain
 * <img src> or <a href> can't load them; we fetch with the Authorization
 * header (alt=media returns the raw bytes) and hand the UI a blob.
 * `onProgress(loaded, total)` is driven by streaming the response body.
 */
export async function downloadFile(fileId, { signal, onProgress, sizeHint } = {}) {
  const res = await driveFetch(`${API}/files/${fileId}?alt=media`, { acct: accountOf(fileId), signal, raw: true });
  const total = Number(res.headers.get('Content-Length')) || Number(sizeHint) || 0;
  const type = res.headers.get('Content-Type') || 'application/octet-stream';
  if (!res.body || !onProgress) return res.blob();

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(chunks, { type });
}

/**
 * Fetch a thumbnail as a Blob.
 *
 * `thumbnailLink` points at lh3.googleusercontent.com and is a short-lived,
 * pre-signed URL, so we first try it without credentials (that avoids a CORS
 * preflight that the image CDN may reject), then with the bearer token. If the
 * file has no thumbnail yet (Drive generates them asynchronously after upload)
 * we fall back to downloading the original for reasonably small images.
 */
export async function fetchThumbnail(file, { size = 480, signal } = {}) {
  const acct = file._acct || accountOf(file.id);
  if (file.thumbnailLink) {
    // Thumbnail links end in "=s220"; ask the CDN for a sharper size.
    const url = file.thumbnailLink.replace(/=s\d+(-c)?$/, `=s${size}`);
    try {
      const res = await fetch(url, { signal, referrerPolicy: 'no-referrer' });
      if (res.ok) return await res.blob();
    } catch (e) {
      if (isAbortError(e)) throw e;
    }
    try {
      const res = await driveFetch(url, { acct, signal, raw: true });
      return await res.blob();
    } catch (e) {
      if (isAbortError(e)) throw e;
    }
  }
  if (file.mimeType?.startsWith('image/') && Number(file.size || 0) <= 15 * 1024 * 1024) {
    return downloadFile(file.id, { signal });
  }
  return null;
}

/** Save a blob to disk via a temporary <a download>. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/* ------------------------------------------------------------------------ */
/* Upload                                                                    */
/* ------------------------------------------------------------------------ */

/** Files above this size (and all videos) use the resumable protocol. */
export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

// Resumable chunks MUST be a multiple of 256 KiB (except the final chunk).
// 16 × 256 KiB = 4 MiB: big enough to be efficient, small enough that a dropped
// connection only costs a few MB of re-upload.
const CHUNK_UNIT = 256 * 1024;
export const CHUNK_SIZE = 16 * CHUNK_UNIT;

/**
 * Minimal Promise wrapper around XMLHttpRequest. We need XHR (not fetch) for
 * uploads because only XHR exposes upload progress events.
 */
function xhr({ method, url, headers = {}, body, signal, onUploadProgress }) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(method, url);
    Object.entries(headers).forEach(([k, v]) => req.setRequestHeader(k, v));
    if (onUploadProgress) req.upload.onprogress = (e) => onUploadProgress(e.loaded, e.total);
    req.onload = () =>
      resolve({
        status: req.status,
        text: req.responseText,
        header: (name) => req.getResponseHeader(name),
      });
    req.onerror = () => reject(new DriveError('Network error', { reason: 'network' }));
    req.ontimeout = () => reject(new DriveError('Network timeout', { reason: 'network' }));
    req.onabort = () => reject(new DriveError('Upload canceled', { reason: 'aborted' }));
    if (signal) {
      if (signal.aborted) return req.abort();
      signal.addEventListener('abort', () => req.abort(), { once: true });
    }
    req.send(body);
  });
}

function xhrError(res) {
  let message = `Upload failed (${res.status})`;
  let reason = 'http_' + res.status;
  try {
    const e = JSON.parse(res.text)?.error;
    if (e) {
      message = e.message || message;
      reason = e.errors?.[0]?.reason || reason;
    }
  } catch {
    /* ignore */
  }
  return new DriveError(message, { status: res.status, reason });
}

/** XHR with the same 401 → refresh → retry behaviour as driveFetch. */
async function authedXhr({ acct, ...opts }) {
  acct = acct || primaryAccount();
  for (let refreshed = false; ; refreshed = true) {
    const token = await tokenProvider.getToken(acct);
    const res = await xhr({ ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !refreshed) {
      await tokenProvider.refreshToken(acct);
      continue;
    }
    return res;
  }
}

/**
 * Simple upload (uploadType=multipart) for small files: metadata and content
 * go in one multipart/related request.
 */
export async function uploadSimple({ acct, file, name, mimeType, parentId, signal, onProgress }) {
  const boundary = 'dg' + Math.random().toString(36).slice(2);
  const metadata = { name, mimeType, parents: [parentId] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const res = await authedXhr({
    acct,
    method: 'POST',
    url: `${UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    signal,
    onUploadProgress: (loaded, total) => onProgress?.(Math.min(file.size, (loaded / total) * file.size), file.size),
  });
  if (res.status >= 200 && res.status < 300) return JSON.parse(res.text);
  throw xhrError(res);
}

/**
 * Resumable upload (uploadType=resumable) — the protocol in four steps:
 *
 * 1. INITIATE: POST the metadata to /upload/drive/v3/files?uploadType=resumable
 *    with X-Upload-Content-Type / X-Upload-Content-Length. Drive replies 200
 *    with a `Location` header: the *session URI*. That URI identifies this
 *    upload for up to a week, so it's what makes resuming possible.
 *
 * 2. UPLOAD CHUNKS: PUT successive byte ranges to the session URI with
 *        Content-Range: bytes START-END/TOTAL
 *    Every chunk except the last must be a multiple of 256 KiB. While the
 *    upload is incomplete Drive answers `308 Resume Incomplete` and a
 *    `Range: bytes=0-N` header telling us the last byte it has stored.
 *
 * 3. RECOVER: if a PUT fails (network drop, 5xx), we ask Drive where it got to
 *    by sending an empty PUT with `Content-Range: bytes * /TOTAL`. The 308 reply's
 *    Range header gives the resume offset and we continue from there, with
 *    exponential backoff between attempts. A 404/410 means the session expired
 *    and the upload has to start over.
 *
 * 4. FINISH: the PUT that delivers the final byte returns 200/201 with the new
 *    file's metadata (the `fields` mask from step 1 applies).
 *
 * `onSession(uri)` lets the caller keep the session URI so that a manual
 * "Retry" after a failure resumes instead of re-uploading from zero.
 */
export async function uploadResumable({ acct, file, name, mimeType, parentId, signal, onProgress, sessionUri, onSession }) {
  const total = file.size;
  const resuming = Boolean(sessionUri);

  // --- 1. Initiate (unless we're resuming an existing session) ------------
  if (!sessionUri) {
    const init = await driveFetch(
      `${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        acct,
        method: 'POST',
        signal,
        raw: true,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': String(total),
        },
        body: JSON.stringify({ name, mimeType, parents: [parentId] }),
      },
    );
    sessionUri = init.headers.get('Location');
    if (!sessionUri) throw new DriveError('Drive did not return an upload session', { reason: 'noSession' });
    onSession?.(sessionUri);
  }

  // Parse "bytes=0-1234" → next offset 1235. Missing header → nothing stored.
  const nextOffsetFrom = (res, fallback) => {
    const range = res.header('Range');
    if (!range) return fallback;
    const m = /bytes=0-(\d+)/.exec(range);
    return m ? Number(m[1]) + 1 : fallback;
  };

  // --- 3. Ask Drive how many bytes it already has --------------------------
  const queryOffset = async (fallback) => {
    const res = await authedXhr({
      acct,
      method: 'PUT',
      url: sessionUri,
      headers: { 'Content-Range': `bytes */${total}` },
      signal,
    });
    if (res.status === 200 || res.status === 201) return { done: JSON.parse(res.text) };
    if (res.status === 308) return { offset: nextOffsetFrom(res, 0) };
    if (res.status === 404 || res.status === 410) {
      onSession?.(null);
      throw new DriveError('Upload session expired, please retry', { status: res.status, reason: 'sessionExpired' });
    }
    if (res.status === 401 || res.status === 403) throw xhrError(res);
    return { offset: fallback };
  };

  let offset = 0;
  if (resuming) {
    const r = await queryOffset(0);
    if (r.done) {
      onProgress?.(total, total);
      return r.done;
    }
    offset = r.offset;
  }

  // --- 2. Upload chunks ---------------------------------------------------
  let failures = 0;
  while (true) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const chunkStart = offset;
    let res;
    try {
      res = await authedXhr({
        acct,
        method: 'PUT',
        url: sessionUri,
        // Zero-byte files: Drive expects "bytes */0".
        headers: { 'Content-Range': total === 0 ? 'bytes */0' : `bytes ${offset}-${end - 1}/${total}` },
        body: chunk,
        signal,
        onUploadProgress: (loaded) => onProgress?.(chunkStart + loaded, total),
      });
    } catch (e) {
      if (isAbortError(e)) throw e;
      res = { status: 0, error: e };
    }

    // --- 4. Finished ------------------------------------------------------
    if (res.status === 200 || res.status === 201) {
      onProgress?.(total, total);
      return JSON.parse(res.text);
    }

    if (res.status === 308) {
      failures = 0;
      offset = nextOffsetFrom(res, end);
      onProgress?.(offset, total);
      continue;
    }

    // Permanent errors: quota, permissions, bad request, expired session.
    if (res.status === 404 || res.status === 410) {
      onSession?.(null);
      throw new DriveError('Upload session expired, please retry', { status: res.status, reason: 'sessionExpired' });
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw xhrError(res);

    // Transient (network drop, 5xx, 408, 429): back off, then ask Drive where to resume.
    failures += 1;
    if (failures > 6) throw res.error || xhrError(res);
    await sleep(Math.min(30_000, 2 ** failures * 500) + Math.random() * 500);
    // Wait for the browser to come back online before probing.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await new Promise((r) => window.addEventListener('online', r, { once: true }));
    }
    try {
      const r = await queryOffset(chunkStart);
      if (r.done) {
        onProgress?.(total, total);
        return r.done;
      }
      offset = r.offset;
      onProgress?.(offset, total);
    } catch (e) {
      if (isAbortError(e) || e.reason === 'sessionExpired') throw e;
      // Probe failed too; loop around and retry the same chunk.
      offset = chunkStart;
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Pooled upload                                                             */
/* ------------------------------------------------------------------------ */

const isQuotaError = (e) => e?.reason === 'storageQuotaExceeded' || e?.reason === 'quotaExceeded';

/**
 * Upload into folder group `parentId`, choosing the account:
 *  - the first connected account (primary first) with room for the file;
 *  - if Drive still says that account is full, mark it full and try the next.
 * The target folder is created in the chosen account if it isn't there yet.
 *
 * `session` / `onSession` carry { acct, uri } for resumable uploads so a retry
 * resumes in the same account instead of starting over somewhere else.
 * Resolves to the new file, tagged for the UI.
 */
export async function uploadToPool({ file, name, mimeType, parentId, signal, onProgress, session, onSession }) {
  const resumable = mimeType.startsWith('video/') || file.size > RESUMABLE_THRESHOLD;
  const tried = new Set();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const acct = (session && connectedAccounts().includes(session.acct) && session.acct) || pickUploadAccount(file.size, tried);
    if (!acct) {
      throw new DriveError('Every linked Google account is full.', { reason: 'storageQuotaExceeded' });
    }
    reserved.set(acct, (reserved.get(acct) || 0) + file.size);
    try {
      const folder = await ensureFolderIn(parentId, acct);
      const opts = { acct, file, name, mimeType, parentId: folder, signal, onProgress };
      const raw = resumable
        ? await uploadResumable({
            ...opts,
            sessionUri: session?.acct === acct ? session.uri : null,
            onSession: (uri) => {
              session = uri ? { acct, uri } : null;
              onSession?.(session);
            },
          })
        : await uploadSimple(opts);
      const q = quotas.get(acct);
      if (q) q.usage += Number(raw.quotaBytesUsed || raw.size || file.size);
      return tag(raw, acct);
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      // This account is full after all: remember that and try the next one.
      const q = quotas.get(acct);
      if (q && q.limit != null) q.usage = q.limit;
      tried.add(acct);
      session = null;
      onSession?.(null);
      onProgress?.(0, file.size);
    } finally {
      reserved.set(acct, (reserved.get(acct) || 0) - file.size);
    }
  }
}
