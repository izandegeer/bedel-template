import { reactive } from 'vue';
import { mergeDeadlines } from './lib/deadlines.js';
import { parseDate } from './lib/dates.js';
import { absenceReport, globalReport } from './lib/absences.js';

/** Fecha de hoy en Madrid, YYYY-MM-DD. */
export const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export const store = reactive({
  loaded: false, error: null,
  timetable: null, manual: null, links: {}, courses: [], announcements: [], resources: [], changes: [], meta: null,
  modules: null, calendar: null, absenceReport: [],
  deadlines: [],
  seen: new Set(JSON.parse(localStorage.getItem('bedel.seen') ?? '[]')),
  seenRes: new Set(JSON.parse(localStorage.getItem('bedel.seenRes') ?? '[]')),
});

async function json(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

export async function loadAll() {
  try {
    const [timetable, manual, links, courses, assignments, announcements, resources, meta, modules, calendar, changes] = await Promise.all([
      json('/data/timetable.json'), json('/data/manual.json'), json('/data/links.json'),
      json('/data/aules/courses.json'), json('/data/aules/assignments.json'),
      json('/data/aules/announcements.json'), json('/data/aules/resources.json'), json('/data/aules/meta.json'),
      json('/data/modules.json'), json('/data/calendar.json'),
      json('/data/aules/changes.json').catch(() => []),
    ]);
    Object.assign(store, { timetable, manual, links, courses, announcements, resources, meta, modules, calendar, changes });
    store.deadlines = mergeDeadlines(assignments, manual);
    store.absenceReport = absenceReport({
      absences: manual.absences ?? [], timetable, modules, calendar, today: madridToday(),
    });
    store.loaded = true;
  } catch (e) {
    store.error = e.message;
  }
}

export function subject(code) {
  return store.timetable?.subjects?.[code] ?? { name: code, color: '#888888' };
}
export function markResSeen(ids) {
  for (const id of ids) store.seenRes.add(id);
  try { localStorage.setItem('bedel.seenRes', JSON.stringify([...store.seenRes])); } catch {}
}
export function markSeen(id) {
  store.seen.add(id);
  localStorage.setItem('bedel.seen', JSON.stringify([...store.seen]));
}
export function manualEventsOn(date) {
  const key = date.toISOString().slice(0, 10);
  return (store.manual?.events ?? []).filter((e) => e.date === key);
}
export const syncedAt = () => (store.meta?.syncedAt ? parseDate(store.meta.syncedAt) : null);
