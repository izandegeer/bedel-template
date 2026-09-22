// Librería de data/manual.json: faltas y eventos añadidos a mano.
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

export function readTimetable(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, 'data/timetable.json'), 'utf8'));
}

export function readManual(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, 'data/manual.json'), 'utf8'));
}

export function writeManual(root = ROOT, manual) {
  writeFileSync(resolve(root, 'data/manual.json'), JSON.stringify(manual, null, 2) + '\n');
}
