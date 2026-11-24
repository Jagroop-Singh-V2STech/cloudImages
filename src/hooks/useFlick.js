import { useCallback, useEffect, useRef, useState } from 'react';

// A flick is a short, sharp jolt: either a strong linear acceleration, or a
// moderate one together with a fast wrist rotation. Normal handling (walking,
// tilting the phone to look at it) stays well below these.
const ACCEL_STRONG = 14; // m/s², gravity removed
const ACCEL_WITH_SPIN = 9;
const SPIN = 300; // °/s
const ARM_DELAY_MS = 600; // ignore the jolt of the tap that armed it
const COOLDOWN_MS = 2000;

const needsPermission = () => typeof window !== 'undefined' && typeof window.DeviceMotionEvent?.requestPermission === 'function';

/**
 * Detect a flick of the phone with DeviceMotion (HTTPS only).
 * motion: 'unsupported' | 'prompt' (iOS: call enable() from a tap) | 'granted' | 'denied'
 */
export function useFlick(onFlick, { enabled = true } = {}) {
  const [motion, setMotion] = useState(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window) || !window.isSecureContext) return 'unsupported';
    return needsPermission() ? 'prompt' : 'granted';
  });
  const cb = useRef(onFlick);
  cb.current = onFlick;

  /** iOS asks for motion access; it must be called from a tap. */
  const enable = useCallback(async () => {
    if (!needsPermission()) return;
    try {
      setMotion((await window.DeviceMotionEvent.requestPermission()) === 'granted' ? 'granted' : 'denied');
    } catch {
      setMotion('denied');
    }
  }, []);

  useEffect(() => {
    if (!enabled || motion !== 'granted') return;
    const armedAt = performance.now();
    let last = 0;
    const onMotion = (e) => {
      const now = performance.now();
      if (now - armedAt < ARM_DELAY_MS || now - last < COOLDOWN_MS) return;
      let accel;
      const a = e.acceleration;
      if (a && a.x != null) accel = Math.hypot(a.x, a.y || 0, a.z || 0);
      else {
        const g = e.accelerationIncludingGravity;
        if (!g || g.x == null) return;
        accel = Math.abs(Math.hypot(g.x, g.y || 0, g.z || 0) - 9.81);
      }
      const r = e.rotationRate;
      const spin = r ? Math.max(Math.abs(r.alpha || 0), Math.abs(r.beta || 0), Math.abs(r.gamma || 0)) : 0;
      if (accel > ACCEL_STRONG || (accel > ACCEL_WITH_SPIN && spin > SPIN)) {
        last = now;
        navigator.vibrate?.(30);
        cb.current?.();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, motion]);

  return { motion, enable };
}
