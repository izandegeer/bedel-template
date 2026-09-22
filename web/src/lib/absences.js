import { sessionsOf } from './agenda.js';
import { madridDate } from './dates.js';

/** Mayor número de faltas n tal que n / hours < limitPercent %. */
export function maxAllowed(hours, limitPercent = 15) {
  let n = Math.floor((hours * limitPercent) / 100);
  while (n > 0 && (n / hours) * 100 >= limitPercent) n--;
  return n;
}

function* eachDay(from, to) {
  let d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) { yield d.toISOString().slice(0, 10); d = new Date(d.getTime() + 86400000); }
}

/** Días lectivos (YYYY-MM-DD) entre from y to, ambos inclusive. */
export function lectiveDays(calendar, from, to) {
  const lo = from > calendar.lective.from ? from : calendar.lective.from;
  const hi = to < calendar.lective.to ? to : calendar.lective.to;
  const out = [];
  for (const day of eachDay(lo, hi)) {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (calendar.holidays.some((h) => h.from <= day && day <= h.to)) continue;
    out.push(day);
  }
  return out;
}

function dateOf(day) { const [y, m, d] = day.split('-').map(Number); return madridDate(y, m, d, 12, 0); }

/** Sesiones de un módulo impartidas hasta `until` (inclusive). */
export function sessionsHeld(timetable, calendar, code, until) {
  return lectiveDays(calendar, calendar.lective.from, until)
    .reduce((n, day) => n + sessionsOf(timetable, dateOf(day), code), 0);
}

/** Nivel de alerta a partir del porcentaje de faltas sobre las horas oficiales. */
export function level(percent, lost) {
  if (lost) return 'lost';
  if (percent >= 12) return 'danger';
  if (percent >= 8) return 'warn';
  return 'ok';
}

/** Informe por módulo. `today` en YYYY-MM-DD. */
export function absenceReport({ absences = [], timetable, modules, calendar, today, countJustified = false }) {
  const limit = modules.limitPercent ?? 15;
  const out = [];
  for (const [code, mod] of Object.entries(modules.modules)) {
    let missed = 0, justified = 0;
    const items = absences
      .filter((a) => a.code === code)
      .map((a) => {
        const sessions = a.sessions ?? sessionsOf(timetable, dateOf(a.date), code);
        if (a.justified) justified += sessions; else missed += sessions;
        return { ...a, sessions };
      })
      .sort((x, y) => y.date.localeCompare(x.date));
    const counted = missed + (countJustified ? justified : 0);
    const percent = (counted / mod.hours) * 100;
    const lost = percent >= limit;
    const max = maxAllowed(mod.hours, limit);
    const held = sessionsHeld(timetable, calendar, code, today);
    out.push({
      code, name: mod.name, hours: mod.hours, weekly: mod.weekly,
      missed, justified, counted, percent, lost, maxAllowed: max, remaining: Math.max(0, max - counted),
      held, percentOfHeld: held ? (counted / held) * 100 : 0,
      level: level(percent, lost), items,
    });
  }
  return out.sort((a, b) => b.percent - a.percent || a.code.localeCompare(b.code));
}

/** Contador global: suma de todos los módulos sobre el total de horas oficiales del curso. */
export function globalReport(report, limitPercent = 15) {
  const hours = report.reduce((n, m) => n + m.hours, 0);
  const counted = report.reduce((n, m) => n + m.counted, 0);
  const missed = report.reduce((n, m) => n + m.missed, 0);
  const justified = report.reduce((n, m) => n + m.justified, 0);
  const held = report.reduce((n, m) => n + (m.held ?? 0), 0);
  const percent = hours ? (counted / hours) * 100 : 0;
  const lost = hours > 0 && percent >= limitPercent;
  const max = maxAllowed(hours, limitPercent);
  return {
    code: 'TOTAL', name: 'Todos los módulos', hours, missed, justified, counted, percent, lost,
    maxAllowed: max, remaining: Math.max(0, max - counted),
    held, percentOfHeld: held ? (counted / held) * 100 : 0, level: level(percent, lost),
  };
}
