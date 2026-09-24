// Librería de data/manual.json: faltas, eventos y diario de trabajo añadidos a mano.
// Las funciones de cálculo son puras: reciben y devuelven objetos, no tocan el disco.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './config.mjs';

// Tipos de evento que acepta la web
export const EVENT_TYPES = ['examen', 'festivo', 'entrega', 'info', 'otro'];

// Abreviaturas de los días, con el lunes como día 0
export const DAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Fecha de hoy en Europe/Madrid, en formato YYYY-MM-DD
export function todayInMadrid(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
}

function assertDate(date) {
  if (!ISO_DATE.test(String(date ?? ''))) throw new Error(`Fecha no válida: ${date}. Formato YYYY-MM-DD.`);
  return date;
}

// Día de la semana con el lunes como 0, sin depender de la zona horaria local
export function weekdayOf(date) {
  assertDate(date);
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

// Sesiones que le tocan a una asignatura un día concreto según el periodo vigente
export function sessionsOn(timetable, code, date) {
  const weekday = weekdayOf(date);
  const period = (timetable.periods ?? []).find((p) => p.from <= date && date <= p.to);
  const classes = period?.classes ?? timetable.classes ?? [];
  const mins = period?.sessionMinutes ?? 45;
  return classes
    .filter((c) => c.day === weekday && c.code === code)
    .reduce((n, c) => {
      const [h1, m1] = c.start.split(':').map(Number);
      const [h2, m2] = c.end.split(':').map(Number);
      return n + Math.round(((h2 * 60 + m2) - (h1 * 60 + m1)) / mins);
    }, 0);
}

function sortedAbsences(absences) {
  return [...absences].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

// Añade una falta y devuelve un manual nuevo. `today` se inyecta para no depender del reloj.
export function addAbsence(manual, timetable, { code, date, sessions, justified, note, today } = {}) {
  assertDate(date);
  const hoy = today ?? todayInMadrid();
  if (date > hoy) throw new Error(`La fecha ${date} es futura; una falta se registra el día que ocurre o después.`);
  if (sessions !== undefined) {
    if (!Number.isInteger(sessions) || sessions < 1) throw new Error(`Número de sesiones no válido: ${sessions}. Usa un entero mayor que 0.`);
  }
  const auto = sessionsOn(timetable, code, date);
  if (auto === 0 && sessions === undefined) {
    throw new Error(`${code} no tiene clase el ${date} (${DAY_NAMES[weekdayOf(date)]}). Usa --sesiones N si aun así quieres registrarla.`);
  }
  const absences = manual.absences ?? [];
  if (absences.some((a) => a.code === code && a.date === date)) {
    throw new Error(`Ya hay una falta de ${code} el ${date}. Usa --borrar primero.`);
  }
  const entry = {
    date,
    code,
    sessions: sessions ?? auto,
    ...(justified ? { justified: true } : {}),
    ...(note ? { note } : {}),
  };
  return { ...manual, absences: sortedAbsences([...absences, entry]) };
}

// Quita las faltas de esa asignatura y fecha; devuelve el manual nuevo y cuántas quitó
export function removeAbsence(manual, { code, date } = {}) {
  assertDate(date);
  const absences = manual.absences ?? [];
  const kept = absences.filter((a) => !(a.code === code && a.date === date));
  return { manual: { ...manual, absences: kept }, removed: absences.length - kept.length };
}

// Añade un evento (examen, festivo, entrega, evaluación u otro) y devuelve un manual nuevo
export function addEvent(manual, { date, type, text, code } = {}) {
  assertDate(date);
  if (!EVENT_TYPES.includes(type)) {
    throw new Error(`Tipo de evento no válido: ${type}. Tipos: ${EVENT_TYPES.join(', ')}.`);
  }
  const texto = String(text ?? '').trim();
  if (!texto) throw new Error('Falta el texto del evento.');
  const entry = { date, type, text: texto, ...(code ? { code } : {}) };
  const events = [...(manual.events ?? []), entry].sort((a, b) => a.date.localeCompare(b.date));
  return { ...manual, events };
}

// Días enteros entre dos fechas ISO, sin depender de la zona horaria local
function daysBetween(desde, hasta) {
  const ms = Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`);
  return Math.round(ms / 86400000);
}

// Añade una entrada al diario de trabajo y devuelve un manual nuevo. `today` se inyecta para no depender del reloj.
export function addLog(manual, timetable, { code, date, text, today } = {}) {
  const hoy = today ?? todayInMadrid();
  const codigo = String(code ?? '').toUpperCase();
  if (!timetable?.subjects?.[codigo]) {
    throw new Error(`Código desconocido: ${code}. Códigos: ${Object.keys(timetable?.subjects ?? {}).join(', ')}.`);
  }
  const fecha = date ?? hoy;
  assertDate(fecha);
  if (fecha > hoy) throw new Error(`La fecha ${fecha} es futura; el diario registra lo ya hecho.`);
  const texto = String(text ?? '').trim();
  if (!texto) throw new Error('Falta el texto de lo que has hecho.');
  const entry = { date: fecha, code: codigo, text: texto };
  const log = [...(manual.log ?? []), entry].sort((a, b) => a.date.localeCompare(b.date));
  return { ...manual, log };
}

// Resumen del diario: lo hecho en los últimos `days` días por asignatura y los días
// desde la última entrada de cada asignatura del curso (null si nunca se ha tocado).
export function weekSummary(manual, timetable, { today, days = 7 } = {}) {
  const hoy = today ?? todayInMadrid();
  assertDate(hoy);
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const log = [...(manual.log ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const byCode = {};
  const sinceByCode = {};
  for (const code of Object.keys(timetable?.subjects ?? {})) sinceByCode[code] = null;
  for (const entry of log) {
    if (!(entry.code in sinceByCode)) continue;
    if (entry.date >= desde && entry.date <= hoy) {
      (byCode[entry.code] ??= []).push({ date: entry.date, text: entry.text });
    }
    if (entry.date <= hoy) sinceByCode[entry.code] = daysBetween(entry.date, hoy);
  }
  return { byCode, sinceByCode };
}

export function readTimetable(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, 'data/timetable.json'), 'utf8'));
}

export function readManual(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, 'data/manual.json'), 'utf8'));
}

export function writeManual(root = ROOT, manual) {
  writeFileSync(resolve(root, 'data/manual.json'), JSON.stringify(manual, null, 2) + '\n');
}
