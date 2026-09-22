import { parseDate } from './dates.js';

/** Une entregas de Aules y manuales. done = submitted o en manual.done. Orden: fecha asc, sin fecha al final, id. */
export function mergeDeadlines(aules, manual) {
  const done = new Set(manual?.done ?? []);
  const seen = new Set();
  const out = [];
  const push = (d) => { if (!seen.has(d.id)) { seen.add(d.id); out.push(d); } };
  for (const a of aules ?? []) {
    push({ id: a.id, code: a.code ?? '?', title: a.title, due: parseDate(a.due), url: a.url ?? null,
      source: 'aules', submitted: !!a.submitted, graded: !!a.graded, done: !!a.submitted || done.has(a.id) });
  }
  for (const m of manual?.deadlines ?? []) {
    push({ id: m.id, code: m.code, title: m.title, due: parseDate(m.due), url: m.url ?? null,
      source: 'manual', submitted: false, graded: false, done: done.has(m.id) });
  }
  return out.sort((x, y) => {
    if (x.due && y.due) return x.due - y.due || x.id.localeCompare(y.id);
    if (!x.due && !y.due) return x.id.localeCompare(y.id);
    return x.due ? -1 : 1;
  });
}

/** Con fecha, no hechas, vencidas hace menos de 1 día. */
export function pending(deadlines, now = new Date()) {
  const limit = now.getTime() - 86400000;
  return deadlines.filter((d) => d.due && !d.done && d.due.getTime() > limit);
}

/** Agrupa por semana ISO (lunes) en Madrid: [{ label, items }]. */
export function groupByWeek(deadlines, formatDay) {
  const groups = new Map();
  for (const d of deadlines) {
    const key = d.due ? weekKey(d.due) : 'sin-fecha';
    if (!groups.has(key)) groups.set(key, { key, label: d.due ? `Semana del ${formatDay(mondayOf(d.due))}` : 'Sin fecha', items: [] });
    groups.get(key).items.push(d);
  }
  return [...groups.values()];
}
function mondayOf(d) { const t = new Date(d); const dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return t; }
function weekKey(d) { return mondayOf(d).toISOString().slice(0, 10); }
