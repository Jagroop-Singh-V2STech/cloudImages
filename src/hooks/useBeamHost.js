import { useCallback, useEffect, useRef, useState } from 'react';
import { connectBeam, newRoomId } from '../lib/beam';

/**
 * Laptop side of "Send from phone". `start()` opens a pairing room; it stays
 * open (so the phone can send several batches) until `stop()` or unmount.
 * The phone is told which folder the laptop is showing whenever it changes.
 *
 * incoming: null | { total, received, failed, done }
 */
export function useBeamHost({ target, onUploaded, onFailed, onDone }) {
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | open | error
  const [phone, setPhone] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const conn = useRef(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const cbs = useRef({ onUploaded, onFailed, onDone });
  cbs.current = { onUploaded, onFailed, onDone };
  const hideTimer = useRef(null);

  const sendTarget = useCallback(() => {
    const t = targetRef.current;
    conn.current?.send({ type: 'target', folderId: t.folderId, folderName: t.folderName });
  }, []);

  const onMessage = useCallback(
    (m) => {
      switch (m.type) {
        case 'peers':
          setPhone(m.roles.includes('phone'));
          if (m.roles.includes('phone')) sendTarget();
          break;
        case 'peer':
          if (m.role !== 'phone') break;
          // Several phones may join; good enough to track "any phone here" by the last event.
          setPhone(m.event === 'join');
          if (m.event === 'join') sendTarget();
          break;
        case 'hello':
          setPhone(true);
          sendTarget();
          break;
        case 'incoming':
          clearTimeout(hideTimer.current);
          setIncoming({ total: Math.max(0, Number(m.count) || 0), received: 0, failed: 0, done: false });
          break;
        case 'uploaded':
          if (typeof m.id !== 'string') break;
          setIncoming((s) => s && { ...s, received: s.received + 1 });
          cbs.current.onUploaded?.(m.id, m.folderId);
          break;
        case 'failed':
          setIncoming((s) => s && { ...s, failed: s.failed + 1 });
          cbs.current.onFailed?.(String(m.name || 'A file'));
          break;
        case 'done':
          setIncoming((s) => s && { ...s, done: true });
          cbs.current.onDone?.();
          clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setIncoming(null), 3500);
          break;
        default:
      }
    },
    [sendTarget],
  );

  const start = useCallback(() => {
    if (conn.current) return;
    const r = newRoomId();
    setRoom(r);
    conn.current = connectBeam(r, 'host', { onMessage, onStatus: setStatus });
  }, [onMessage]);

  const stop = useCallback(() => {
    conn.current?.close();
    conn.current = null;
    setRoom(null);
    setStatus('idle');
    setPhone(false);
    setIncoming(null);
  }, []);

  useEffect(() => () => conn.current?.close(), []);

  // Keep the phone pointed at whatever folder is open here.
  useEffect(() => {
    if (phone) sendTarget();
  }, [phone, target.folderId, target.folderName, sendTarget]);

  return { room, status, phone, incoming, start, stop };
}
