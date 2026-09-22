// Tests de la librería de manual.json: sesiones, faltas y eventos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EVENT_TYPES,
  addAbsence,
  addEvent,
  readManual,
  readTimetable,
  removeAbsence,
  sessionsOn,
  writeManual,
} from './manual.mjs';

// Datos reales del repo, solo lectura
const tt = readTimetable();

// Crea un directorio temporal con data/ para probar la escritura
function tempRoot(manual) {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-manual-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'data/manual.json'), JSON.stringify(manual, null, 2) + '\n');
  return dir;
}

test('readTimetable y readManual leen los datos del repo', () => {
  assert.ok(tt.subjects.SOS, 'timetable.json debe traer la asignatura SOS');
  assert.ok(Array.isArray(tt.periods));
  const manual = readManual();
  assert.ok(Array.isArray(manual.events));
});

test('sessionsOn cuenta sesiones de la asignatura ese día según el periodo', () => {
  // 2026-09-15 es martes; SOS tiene 1 sesión de 45 min en septiembre
  assert.equal(sessionsOn(tt, 'SOS', '2026-09-15'), 1);
  assert.equal(sessionsOn(tt, 'SOS', '2026-09-16'), 0);
  // 2026-09-16 es miércoles; DWS tiene dos tramos de 45 min y DWC uno de 90
  assert.equal(sessionsOn(tt, 'DWS', '2026-09-16'), 2);
  assert.equal(sessionsOn(tt, 'DWC', '2026-09-16'), 2);
});

test('sessionsOn devuelve 0 para un código sin clase y para un código desconocido', () => {
  assert.equal(sessionsOn(tt, 'SOS', '2026-09-19'), 0); // sábado
  assert.equal(sessionsOn(tt, 'XXX', '2026-09-15'), 0);
});

test('addAbsence añade la falta ordenada por fecha y código', () => {
  const manual = { absences: [{ date: '2026-09-22', code: 'DWS', sessions: 2 }] };
  const out = addAbsence(manual, tt, { code: 'SOS', date: '2026-09-15', today: '2026-09-22' });
  assert.deepEqual(out.absences, [
    { date: '2026-09-15', code: 'SOS', sessions: 1 },
    { date: '2026-09-22', code: 'DWS', sessions: 2 },
  ]);
});

test('addAbsence no muta el manual de entrada', () => {
  const manual = { absences: [] };
  addAbsence(manual, tt, { code: 'SOS', date: '2026-09-15', today: '2026-09-22' });
  assert.deepEqual(manual.absences, []);
});

test('addAbsence guarda justificada y nota solo si se pasan', () => {
  const out = addAbsence({}, tt, {
    code: 'SOS', date: '2026-09-15', justified: true, note: 'médico', today: '2026-09-22',
  });
  assert.deepEqual(out.absences, [
    { date: '2026-09-15', code: 'SOS', sessions: 1, justified: true, note: 'médico' },
  ]);
});

test('addAbsence rechaza duplicado', () => {
  const manual = { absences: [{ date: '2026-09-15', code: 'SOS', sessions: 1 }] };
  assert.throws(
    () => addAbsence(manual, tt, { code: 'SOS', date: '2026-09-15', today: '2026-09-22' }),
    /Ya hay una falta de SOS el 2026-09-15/,
  );
});

test('addAbsence rechaza fecha futura', () => {
  assert.throws(
    () => addAbsence({}, tt, { code: 'SOS', date: '2026-09-29', today: '2026-09-22' }),
    /es futura/,
  );
});

test('addAbsence rechaza un día sin clase salvo que se indiquen sesiones', () => {
  assert.throws(
    () => addAbsence({}, tt, { code: 'SOS', date: '2026-09-16', today: '2026-09-22' }),
    /no tiene clase el 2026-09-16 \(mié\)/,
  );
  const out = addAbsence({}, tt, { code: 'SOS', date: '2026-09-16', sessions: 3, today: '2026-09-22' });
  assert.equal(out.absences[0].sessions, 3);
});

test('addAbsence rechaza una fecha con formato inválido', () => {
  assert.throws(
    () => addAbsence({}, tt, { code: 'SOS', date: '15/09/2026', today: '2026-09-22' }),
    /Fecha no válida/,
  );
});

test('addAbsence rechaza un número de sesiones que no es válido', () => {
  assert.throws(
    () => addAbsence({}, tt, { code: 'SOS', date: '2026-09-16', sessions: 0, today: '2026-09-22' }),
    /sesiones/,
  );
  assert.throws(
    () => addAbsence({}, tt, { code: 'SOS', date: '2026-09-16', sessions: 'dos', today: '2026-09-22' }),
    /sesiones/,
  );
});

test('removeAbsence devuelve cuántas quitó y no muta la entrada', () => {
  const manual = {
    absences: [
      { date: '2026-09-15', code: 'SOS', sessions: 1 },
      { date: '2026-09-15', code: 'DWS', sessions: 2 },
    ],
  };
  const { manual: out, removed } = removeAbsence(manual, { code: 'SOS', date: '2026-09-15' });
  assert.equal(removed, 1);
  assert.deepEqual(out.absences, [{ date: '2026-09-15', code: 'DWS', sessions: 2 }]);
  assert.equal(manual.absences.length, 2);
});

test('removeAbsence devuelve 0 si no había ninguna', () => {
  const { removed } = removeAbsence({ absences: [] }, { code: 'SOS', date: '2026-09-15' });
  assert.equal(removed, 0);
});

test('addEvent añade {date,type,text,code} y rechaza tipo desconocido', () => {
  const m = addEvent({ events: [] }, { date: '2026-10-14', type: 'examen', text: 'Tema 2', code: 'DIG' });
  assert.deepEqual(m.events, [{ date: '2026-10-14', type: 'examen', text: 'Tema 2', code: 'DIG' }]);
  assert.throws(() => addEvent(m, { date: '2026-10-14', type: 'fiesta', text: 'x' }), /tipo/i);
});

test('addEvent omite el código si no se pasa y ordena por fecha', () => {
  let m = addEvent({ events: [] }, { date: '2026-10-12', type: 'festivo', text: 'Fiesta Nacional' });
  m = addEvent(m, { date: '2026-10-09', type: 'festivo', text: "9 d'Octubre" });
  assert.deepEqual(m.events, [
    { date: '2026-10-09', type: 'festivo', text: "9 d'Octubre" },
    { date: '2026-10-12', type: 'festivo', text: 'Fiesta Nacional' },
  ]);
});

test('addEvent exige texto y fecha válida', () => {
  assert.throws(() => addEvent({}, { date: '2026-10-14', type: 'examen', text: '  ' }), /texto/i);
  assert.throws(() => addEvent({}, { date: '14-10-2026', type: 'examen', text: 'Tema 2' }), /Fecha no válida/);
});

test('EVENT_TYPES son los cinco tipos del plan', () => {
  assert.deepEqual(EVENT_TYPES, ['examen', 'festivo', 'entrega', 'info', 'otro']);
});

test('writeManual escribe con dos espacios y salto de línea final', () => {
  const dir = tempRoot({ absences: [], events: [] });
  const manual = addAbsence(readManual(dir), tt, { code: 'SOS', date: '2026-09-15', today: '2026-09-22' });
  writeManual(dir, manual);
  const raw = readFileSync(join(dir, 'data/manual.json'), 'utf8');
  assert.ok(raw.endsWith('}\n'), 'debe terminar en salto de línea');
  assert.match(raw, /\n {2}"absences"/);
  assert.deepEqual(JSON.parse(raw).absences, [{ date: '2026-09-15', code: 'SOS', sessions: 1 }]);
});
