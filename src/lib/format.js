import { FOLDER_MIME } from './drive';

export const isFolder = (f) => f?.mimeType === FOLDER_MIME;
export const isImage = (f) => f?.mimeType?.startsWith('image/');
export const isVideo = (f) => f?.mimeType?.startsWith('video/');
export const isMedia = (f) => isImage(f) || isVideo(f);

export function formatBytes(bytes, digits = 1) {
  const n = Number(bytes);
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(digits)} ${units[i]}`;
}

export function formatSpeed(bps) {
  return bps > 0 ? `${formatBytes(bps)}/s` : '';
}

export function formatDuration(ms) {
  const s = Math.round(Number(ms) / 1000);
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (rtf && abs < 60) return 'Just now';
  if (rtf && abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (rtf && abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (rtf && abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Split "holiday.photo.jpg" → ["holiday.photo", ".jpg"]. */
export function splitExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

export const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
