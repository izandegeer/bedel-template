import { madridParts, madridDate } from './dates.js';

/** Clave YYYY-MM-DD a partir de componentes de fecha. */
export function dayKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Clave YYYY-MM-DD (Madrid) de un instante. */
export function keyOf(date) {
  const p = madridParts(date);
  return dayKey(p.year, p.month, p.day);
}

/**
 * Rejilla mensual de 6 semanas × 7 días empezando en lunes.
 * `month` es 1-12. Devuelve [{ key, year, month, day, inMonth, isWeekend }].
 */
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // 0 = lunes
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    const dow = (d.getUTCDay() + 6) % 7;
    out.push({
      key: dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      inMonth: d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year,
      isWeekend: dow >= 5,
    });
  }
  return out;
}

/** Título "Septiembre 2026" en es-ES, capitalizado. */
export function monthLabel(year, month) {
  const m = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${year}`;
}

/** Mes anterior/siguiente: step = ±1. */
export function shiftMonth(year, month, step) {
  const m = month - 1 + step;
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
}

/**
 * Indexa entregas y eventos por día (clave YYYY-MM-DD en Madrid).
 * Map<key, { deadlines, exams, holidays, others }>.
 */
export function itemsByDay(deadlines = [], events = []) {
  const map = new Map();
  const slot = (key) => {
    if (!map.has(key)) map.set(key, { deadlines: [], exams: [], holidays: [], others: [] });
    return map.get(key);
  };
  for (const d of deadlines) {
    if (!d?.due) continue;
    slot(keyOf(d.due)).deadlines.push(d);
  }
  for (const e of events ?? []) {
    if (!e?.date) continue;
    const s = slot(e.date);
    if (e.type === 'festivo') s.holidays.push(e);
    else if (e.type === 'examen') s.exams.push(e);
    else s.others.push(e);
  }
  return map;
}

/** Descompone una clave YYYY-MM-DD en [year, month, day]. */
function partsOfKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!m) throw new Error(`clave de día inválida: ${key}`);
  return [+m[1], +m[2], +m[3]];
}

/** Clave desplazada `n` días. */
function shiftDays(key, n) {
  const [y, m, d] = partsOfKey(key);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return dayKey(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

/**
 * Las 7 claves YYYY-MM-DD (lunes→domingo) de la semana que contiene `key`.
 * Devuelve [{ key, year, month, day, isWeekend }] con la misma forma que monthGrid,
 * salvo `inMonth`, que no aplica en vista semanal.
 */
export function weekOf(key) {
  const [y, m, d] = partsOfKey(key);
  const base = new Date(Date.UTC(y, m - 1, d));
  const offset = (base.getUTCDay() + 6) % 7; // 0 = lunes
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(Date.UTC(y, m - 1, d - offset + i));
    out.push({
      key: dayKey(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()),
      year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate(),
      isWeekend: i >= 5,
    });
  }
  return out;
}

/** Semana anterior/siguiente: devuelve la clave desplazada n semanas. */
export function shiftWeek(key, n) {
  return shiftDays(key, 7 * n);
}

/** Instante al mediodía de Madrid de una clave YYYY-MM-DD, listo para el horario. */
export function dateOfKey(key) {
  const [y, m, d] = partsOfKey(key);
  return madridDate(y, m, d, 12, 0);
}

/** Días de la semana de `key` con nombre corto y marca del día de hoy. */
export function weekStrip(key, todayKey) {
  const SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return weekOf(key).map((d, i) => ({ ...d, label: SHORT[i], isToday: d.key === todayKey }));
}

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });
function shortMonth(year, month) {
  return MONTH_SHORT.format(new Date(Date.UTC(year, month - 1, 1))).replace(/\.$/, '');
}

/**
 * Título de una semana: "21-27 sept 2026", "28 sept - 4 oct 2026",
 * "28 dic 2026 - 3 ene 2027". Acepta las claves (o los días) de weekOf().
 */
export function weekLabel(keys = []) {
  const list = keys.map((k) => (typeof k === 'string' ? k : k?.key));
  const first = list[0], last = list[list.length - 1];
  if (!first || !last) return '';
  const [y1, m1, d1] = partsOfKey(first);
  const [y2, m2, d2] = partsOfKey(last);
  if (y1 !== y2) return `${d1} ${shortMonth(y1, m1)} ${y1} - ${d2} ${shortMonth(y2, m2)} ${y2}`;
  if (m1 !== m2) return `${d1} ${shortMonth(y1, m1)} - ${d2} ${shortMonth(y2, m2)} ${y2}`;
  return `${d1}-${d2} ${shortMonth(y1, m1)} ${y1}`;
}
