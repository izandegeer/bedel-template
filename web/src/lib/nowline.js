import { madridParts } from './dates.js';
import { dayKey } from './calendar.js';

/**
 * Posición de la hora actual sobre una lista ordenada de bloques con `start` y `end` (Date).
 * Devuelve `{ kind: 'in', index, fraction }` si cae dentro de un bloque,
 * `{ kind: 'gap', after, before, fraction }` si cae en un hueco entre dos bloques,
 * o `{ kind: 'outside' }` si queda antes del primero, después del último o no hay bloques.
 */
export function nowPosition(blocks, now) {
  const list = blocks ?? [];
  if (!list.length || now == null) return { kind: 'outside' };
  const t = +now;
  if (isNaN(t) || t < +list[0].start || t >= +list[list.length - 1].end) return { kind: 'outside' };
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (t >= +b.start && t < +b.end) return { kind: 'in', index: i, fraction: span(+b.start, +b.end, t) };
    const prev = list[i - 1];
    if (prev && t >= +prev.end && t < +b.start) {
      return { kind: 'gap', after: i - 1, before: i, fraction: span(+prev.end, +b.start, t) };
    }
  }
  return { kind: 'outside' };
}

/**
 * Fila de la rejilla que contiene `nowMinutes` dentro de unas fronteras ordenadas (minutos desde medianoche).
 * Devuelve `{ row, fraction }` con `row` como índice base 0 de la fila, o null si queda fuera del rango.
 */
export function rowFraction(boundariesMinutes, nowMinutes) {
  const bounds = boundariesMinutes ?? [];
  if (bounds.length < 2 || nowMinutes == null || isNaN(nowMinutes)) return null;
  if (nowMinutes < bounds[0] || nowMinutes >= bounds[bounds.length - 1]) return null;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (nowMinutes >= bounds[i] && nowMinutes < bounds[i + 1]) {
      return { row: i, fraction: span(bounds[i], bounds[i + 1], nowMinutes) };
    }
  }
  return null;
}

function span(start, end, t) { return end > start ? (t - start) / (end - start) : 0; }

/**
 * Tiempo transcurrido sobre una semana mostrada (lunes-viernes).
 * `weekDays` es una lista de días con clave `key` (YYYY-MM-DD) o de claves sueltas.
 * Devuelve `{ pastDays, today }`: índices de los días ya terminados y el índice de hoy,
 * o null si hoy no cae dentro de la semana mostrada.
 */
export function elapsedColumns(weekDays, now) {
  const days = weekDays ?? [];
  const out = { pastDays: [], today: null };
  if (!days.length || now == null || isNaN(+now)) return out;
  const p = madridParts(now);
  const todayKey = dayKey(p.year, p.month, p.day);
  days.forEach((d, i) => {
    const key = typeof d === 'string' ? d : d?.key;
    if (!key) return;
    if (key < todayKey) out.pastDays.push(i);
    else if (key === todayKey) out.today = i;
  });
  return out;
}
