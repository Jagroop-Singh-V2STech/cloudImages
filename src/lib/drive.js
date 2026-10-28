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
  getToken: async () => null,
  refreshToken: async () => {
    throw new DriveError('Not signed in', { status: 401, reason: 'unauthenticated' });
  },
};

/**
 * Wired up by AuthProvider. `getToken` returns a valid token (refreshing
 * proactively if it is about to expire). `refreshToken` forces a new token and
 * resolves once the user (silently or via the "Session expired" prompt) has one.
 */
export function configureDrive(provider) {
  tokenProvider = provider;
}

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
      return 'Your Google storage is full. Free up space or upgrade your plan to keep uploading.';
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
export async function driveFetch(url, { method = 'GET', headers = {}, body, signal, raw = false } = {}) {
  let refreshed = false;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const token = await tokenProvider.getToken();
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
      await tokenProvider.refreshToken();
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
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

export async function getUserInfo() {
  return driveFetch('https://www.googleapis.com/oauth2/v3/userinfo');
}

/** about.get — Drive requires an explicit `fields` mask for this endpoint. */
export async function getQuota() {
  const data = await driveFetch(`${API}/about?fields=storageQuota`);
  const q = data.storageQuota || {};
  return {
    // `limit` is absent for accounts with unlimited storage.
    limit: q.limit ? Number(q.limit) : null,
    usage: Number(q.usage || 0),
    usageInDrive: Number(q.usageInDrive || 0),
    usageInDriveTrash: Number(q.usageInDriveTrash || 0),
  };
}

/* ------------------------------------------------------------------------ */
/* Folders & listing                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Find the app's root folder, creating it on first login.
 *
 * Because of the drive.file scope this query can only ever match a folder the
 * app created itself, so a user's own unrelated "DriveGallery" folder is never
 * picked up by mistake. `'root' in parents` limits it to the top of My Drive.
 */
let rootFolderPromise = null;

export function findOrCreateRootFolder() {
  // Single-flight: concurrent callers (e.g. React StrictMode double-mounting)
  // share one lookup, otherwise both could miss and create two root folders.
  if (!rootFolderPromise) {
    rootFolderPromise = lookupOrCreateRoot().catch((e) => {
      rootFolderPromise = null;
      throw e;
    });
  }
  return rootFolderPromise;
}

/** Forget the cached root folder (on sign-out, the next user has their own). */
export function resetRootFolder() {
  rootFolderPromise = null;
}

async function lookupOrCreateRoot() {
  const q = `name='${esc(ROOT_FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`;
  const data = await driveFetch(
    `${API}/files?${qs({ q, fields: `files(${FILE_FIELDS})`, orderBy: 'createdTime', pageSize: 1, spaces: 'drive' })}`,
  );
  if (data.files?.length) return data.files[0];
  return createFolder(ROOT_FOLDER_NAME, 'root');
}

export async function createFolder(name, parentId) {
  return driveFetch(`${API}/files?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

const SORT_KEYS = {
  name: 'name_natural',
  date: 'modifiedTime',
  size: 'quotaBytesUsed',
};

/**
 * List one page of a folder (or search across the whole app).
 *
 * Drive search query syntax: https://developers.google.com/drive/api/guides/search-files
 *   "'FOLDER_ID' in parents"   → direct children of that folder only (not recursive)
 *   "trashed=false"            → hide items the user moved to the trash
 *   "mimeType contains 'image/'" → MIME prefix match for the type filter
 *   "name contains 'foo'"       → prefix/word match on the file name (case-insensitive)
 *
 * orderBy starts with `folder` so folders are grouped before files on every
 * page; without it a folder could show up on page 3 between two photos.
 */
export async function listFiles({ folderId, search, filter = 'all', sort = 'name', direction = 'asc', pageToken, pageSize = 60, signal }) {
  const clauses = ['trashed=false'];
  // A search spans all of DriveGallery. drive.file already limits results to
  // files the app created, so no parent clause is needed.
  if (!search) clauses.push(`'${esc(folderId)}' in parents`);
  if (search) clauses.push(`name contains '${esc(search)}'`);
  if (filter === 'images') clauses.push(`(mimeType contains 'image/' or mimeType='${FOLDER_MIME}')`);
  else if (filter === 'videos') clauses.push(`(mimeType contains 'video/' or mimeType='${FOLDER_MIME}')`);
  else clauses.push(`(mimeType contains 'image/' or mimeType contains 'video/' or mimeType='${FOLDER_MIME}')`);

  const key = SORT_KEYS[sort] || 'name_natural';
  const orderBy = `folder,${key}${direction === 'desc' ? ' desc' : ''}`;

  return driveFetch(
    `${API}/files?${qs({
      q: clauses.join(' and '),
      orderBy,
      pageSize,
      pageToken,
      spaces: 'drive',
      fields: `nextPageToken,files(${FILE_FIELDS})`,
    })}`,
    { signal },
  );
}

/** All direct sub-folders of a folder (used by the sidebar and MoveDialog). */
export async function listSubfolders(parentId, { signal } = {}) {
  const out = [];
  let pageToken;
  do {
    const data = await driveFetch(
      `${API}/files?${qs({
        q: `'${esc(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
        orderBy: 'name_natural',
        pageSize: 200,
        pageToken,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      })}`,
      { signal },
    );
    out.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function getFile(fileId) {
  return driveFetch(`${API}/files/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`);
}

/**
 * Walk up the `parents` chain from a folder to the app root and return the
 * breadcrumb path [root, ..., folder]. Used after a search, where we only know
 * the folder's id.
 */
export async function getFolderPath(folderId, rootId) {
  const path = [];
  let id = folderId;
  for (let depth = 0; id && depth < 32; depth++) {
    const f = await driveFetch(`${API}/files/${id}?fields=id,name,parents`);
    path.unshift({ id: f.id, name: f.name });
    if (f.id === rootId) return path;
    id = f.parents?.[0];
  }
  // Fell off the top without meeting the root: the folder lives outside the app.
  return null;
}

/* ------------------------------------------------------------------------ */
/* Update                                                                    */
/* ------------------------------------------------------------------------ */

export async function renameFile(fileId, name) {
  return driveFetch(`${API}/files/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
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
 */
export async function moveFile(fileId, newParentId, oldParents = []) {
  return driveFetch(
    `${API}/files/${fileId}?${qs({
      addParents: newParentId,
      removeParents: oldParents.join(','),
      fields: FILE_FIELDS,
    })}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
}

/** "Delete" = move to the Drive trash; the user can still recover it for 30 days. */
export async function trashFile(fileId) {
  return driveFetch(`${API}/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

export async function restoreFile(fileId) {
  return driveFetch(`${API}/files/${fileId}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: false }),
  });
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
  const res = await driveFetch(`${API}/files/${fileId}?alt=media`, { signal, raw: true });
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
      const res = await driveFetch(url, { signal, raw: true });
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
async function authedXhr(opts) {
  for (let refreshed = false; ; refreshed = true) {
    const token = await tokenProvider.getToken();
    const res = await xhr({ ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !refreshed) {
      await tokenProvider.refreshToken();
      continue;
    }
    return res;
  }
}

/**
 * Simple upload (uploadType=multipart) for small files: metadata and content
 * go in one multipart/related request.
 */
export async function uploadSimple({ file, name, mimeType, parentId, signal, onProgress }) {
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
export async function uploadResumable({ file, name, mimeType, parentId, signal, onProgress, sessionUri, onSession }) {
  const total = file.size;
  const resuming = Boolean(sessionUri);

  // --- 1. Initiate (unless we're resuming an existing session) ------------
  if (!sessionUri) {
    const init = await driveFetch(
      `${UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
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
