import { getCurrentInstance, onUnmounted, ref } from 'vue';
import { parseDate } from './dates.js';

/**
 * Instante fijado para pruebas y capturas, o null si no hay ninguno.
 * Se lee de `window.__bedelNow` (ISO) o del parámetro de URL `?now=2026-09-17T18:20` (hora de Madrid).
 */
export function fixedNow() {
  if (typeof window === 'undefined') return null;
  const candidates = [];
  if (typeof window.__bedelNow === 'string') candidates.push(window.__bedelNow);
  try {
    const q = new URLSearchParams(window.location.search).get('now');
    if (q) candidates.push(q);
  } catch { /* sin location utilizable */ }
  for (const s of candidates) {
    const d = parseDate(s) ?? new Date(s);
    if (d instanceof Date && !isNaN(d)) return d;
  }
  return null;
}

/**
 * Ref de `Date` con la hora actual, refrescada cada `intervalMs` y al volver a la pestaña.
 * Si hay un instante fijado (ver `fixedNow`), devuelve ese valor congelado.
 */
export function useNow(intervalMs = 60000) {
  const fixed = fixedNow();
  const now = ref(fixed ?? new Date());
  if (fixed || typeof window === 'undefined') return now;

  const tick = () => { now.value = new Date(); };
  const timer = setInterval(tick, intervalMs);
  const onVisible = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', onVisible);

  const stop = () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
  if (getCurrentInstance()) onUnmounted(stop);
  now.stop = stop;
  return now;
}
