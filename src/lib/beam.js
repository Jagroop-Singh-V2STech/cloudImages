/**
 * "Send from phone": a pairing room on the Worker (BeamRoom Durable Object)
 * that relays small JSON messages between the laptop ("host") and the phone.
 * The photos themselves go from the phone straight to Google Drive.
 *
 * Messages
 *   relay → any   { type: 'peers', roles }            who was already in the room
 *   relay → any   { type: 'peer', role, event }       join | leave
 *   host  → phone { type: 'target', folderId, folderName }   where uploads should go
 *   phone → host  { type: 'hello' }                   ask for the target again
 *   phone → host  { type: 'incoming', count }         a flick: `count` files on the way
 *   phone → host  { type: 'uploaded', id, folderId }  one file is in Drive
 *   phone → host  { type: 'failed', name }            one file couldn't be uploaded
 *   phone → host  { type: 'done' }                    the batch is finished
 */

const API = (import.meta.env.VITE_LINK_API_URL || '').replace(/\/$/, '');
const PING_MS = 25_000;

export const BEAM_PARAM = 'beam';

/** 128 random bits, base64url (22 chars). Only the laptop's QR code carries it. */
export function newRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The link the phone opens (same app, same origin as the laptop). */
export function beamLink(room) {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set(BEAM_PARAM, room);
  return u.toString();
}

/** Room id from this page's URL, if it was opened from the laptop's QR code. */
export function roomFromUrl() {
  const room = new URLSearchParams(window.location.search).get(BEAM_PARAM);
  return room && /^[A-Za-z0-9_-]{22,64}$/.test(room) ? room : null;
}

/** Drop ?beam= from the address bar (e.g. when the phone moves on to the gallery). */
export function clearRoomFromUrl() {
  const u = new URL(window.location.href);
  u.searchParams.delete(BEAM_PARAM);
  window.history.replaceState(null, '', u.toString());
}

/**
 * Join a room. Reconnects with backoff until `close()` is called.
 * onStatus: 'connecting' | 'open' | 'error' (several failed attempts in a row).
 */
export function connectBeam(room, role, { onMessage, onStatus }) {
  let ws = null;
  let closed = false;
  let failures = 0;
  let retryTimer = null;
  let pingTimer = null;

  const open = () => {
    const base = API || window.location.origin;
    ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/beam/${room}?role=${role}`);
    onStatus?.(failures >= 2 ? 'error' : 'connecting');
    ws.onopen = () => {
      failures = 0;
      onStatus?.('open');
      pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try {
        onMessage?.(JSON.parse(e.data));
      } catch {
        /* not ours */
      }
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (closed) return;
      failures += 1;
      onStatus?.(failures >= 2 ? 'error' : 'connecting');
      retryTimer = setTimeout(open, Math.min(10_000, 500 * 2 ** failures));
    };
  };
  open();

  return {
    send(msg) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
    },
  };
}
