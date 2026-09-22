import { madridParts, madridDate } from './dates.js';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

function hm(s) { const [h, m] = s.split(':').map(Number); return [h, m]; }
function ymd(date) { const p = madridParts(date); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; }

/** Periodo del horario vigente en una fecha (o null si no hay periodos que la contengan). */
export function periodAt(tt, date) {
  const key = ymd(date);
  return (tt.periods ?? []).find((p) => p.from <= key && key <= p.to) ?? null;
}

/** Clases del horario vigente en una fecha; `classes` como respaldo. */
export function classesOn(tt, date) { return periodAt(tt, date)?.classes ?? tt.classes ?? []; }

/** Duración de una sesión oficial (minutos) en una fecha. */
export function sessionMinutesAt(tt, date) { return periodAt(tt, date)?.sessionMinutes ?? 45; }

/** Sesiones oficiales de un módulo en un día concreto según el horario vigente. */
export function sessionsOf(tt, date, code) {
  const mins = sessionMinutesAt(tt, date);
  return blocksOn(tt, date)
    .filter((b) => b.code === code)
    .reduce((n, b) => n + Math.round((b.end - b.start) / 60000 / mins), 0);
}

/** Bloques de clase de un día concreto, con instantes reales. */
export function blocksOn(tt, date) {
  const p = madridParts(date);
  return classesOn(tt, date)
    .filter((c) => c.day === p.weekday)
    .map((c) => {
      const [sh, sm] = hm(c.start), [eh, em] = hm(c.end);
      const subj = tt.subjects?.[c.code];
      return {
        id: `${p.weekday}-${c.start}-${c.code}`, code: c.code,
        name: subj?.name ?? c.code, color: subj?.color ?? '#888888',
        teacher: tt.teachers?.[c.teacher] ?? c.teacher, room: tt.room ?? '',
        start: madridDate(p.year, p.month, p.day, sh, sm), end: madridDate(p.year, p.month, p.day, eh, em),
      };
    })
    .sort((a, b) => a.start - b.start);
}

/** Agenda a mostrar: hoy si quedan clases; si no, el siguiente día lectivo. */
export function agendaAt(tt, now = new Date()) {
  const today = blocksOn(tt, now);
  if (today.length && now < today[today.length - 1].end) {
    return {
      label: 'Hoy', date: now, blocks: today,
      current: today.find((b) => now >= b.start && now < b.end) ?? null,
      next: today.find((b) => b.start > now) ?? null,
    };
  }
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const blocks = blocksOn(tt, d);
    if (blocks.length) {
      return { label: i === 1 ? 'Mañana' : DAY_LABELS[madridParts(d).weekday], date: d, blocks, current: null, next: blocks[0] };
    }
  }
  return { label: 'Hoy', date: now, blocks: [], current: null, next: null };
}

/** Rejilla semanal lunes-viernes de la semana de `date`, con el horario del periodo vigente. */
export function weekGrid(tt, date = new Date()) {
  const p = madridParts(date);
  return DAY_SHORT.map((label, day) => {
    const ref = madridDate(p.year, p.month, p.day - p.weekday + day, 12, 0);
    return { day, label, blocks: blocksOn(tt, ref) };
  });
}
