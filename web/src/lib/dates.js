export const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
});
const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Componentes de una fecha en Madrid. weekday: 0 = lunes … 6 = domingo. */
export function madridParts(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, weekday: WEEKDAYS[p.weekday] };
}

/** Offset de Madrid (minutos) en un instante dado. */
function madridOffsetMinutes(date) {
  const p = madridParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Construye un instante a partir de componentes locales de Madrid. */
export function madridDate(year, month, day, hour = 0, minute = 0) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off = madridOffsetMinutes(guess);
  const d = new Date(guess.getTime() - off * 60000);
  // Segunda pasada por si el offset cambia justo en la transición.
  const off2 = madridOffsetMinutes(d);
  return off2 === off ? d : new Date(guess.getTime() - off2 * 60000);
}

/** ISO con offset, "YYYY-MM-DDTHH:mm" (Madrid) o "YYYY-MM-DD" (23:59 Madrid). null si no parsea. */
export function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/))) {
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/))) return madridDate(+m[1], +m[2], +m[3], +m[4], +m[5]);
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return madridDate(+m[1], +m[2], +m[3], 23, 59);
  return null;
}

export function formatDay(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
    .format(d).replace(/\.,?/g, '').replace(/,/g, '');
}
export function formatTime(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
export function formatDateTime(d) { return `${formatDay(d)} ${formatTime(d)}`; }

/** Días de calendario (Madrid) desde now hasta d. */
export function daysUntil(d, now = new Date()) {
  const a = madridParts(now), b = madridParts(d);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}
