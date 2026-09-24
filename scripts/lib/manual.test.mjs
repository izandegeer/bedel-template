// Tests de la librería de manual.json: sesiones, faltas, eventos y diario de trabajo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EVENT_TYPES,
  addAbsence,
  addEvent,
  addLog,
  readManual,
  readTimetable,
  removeAbsence,
  sessionsOn,
  weekSummary,
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

// --- diario de trabajo (log) ---

test('addLog añade la entrada ordenada por fecha', () => {
  const manual = { log: [{ date: '2026-09-22', code: 'DWS', text: 'tema 3' }] };
  const out = addLog(manual, tt, { code: 'DWC', date: '2026-09-21', text: 'DOM', today: '2026-09-24' });
  assert.deepEqual(out.log, [
    { date: '2026-09-21', code: 'DWC', text: 'DOM' },
    { date: '2026-09-22', code: 'DWS', text: 'tema 3' },
  ]);
});

test('addLog crea la lista log si no existe y usa today por defecto', () => {
  const out = addLog({ events: [] }, tt, { code: 'DWC', text: 'actividades 1-6 del DOM', today: '2026-09-24' });
  assert.deepEqual(out.log, [{ date: '2026-09-24', code: 'DWC', text: 'actividades 1-6 del DOM' }]);
  assert.deepEqual(out.events, []);
});

test('addLog no muta el manual de entrada', () => {
  const manual = { log: [] };
  addLog(manual, tt, { code: 'DWC', text: 'DOM', today: '2026-09-24' });
  assert.deepEqual(manual.log, []);
});

test('addLog rechaza un código que no está en subjects', () => {
  assert.throws(
    () => addLog({}, tt, { code: 'XXX', text: 'algo', today: '2026-09-24' }),
    /Código desconocido: XXX/,
  );
});

test('addLog rechaza fecha futura y formato inválido', () => {
  assert.throws(
    () => addLog({}, tt, { code: 'DWC', date: '2026-09-25', text: 'algo', today: '2026-09-24' }),
    /es futura/,
  );
  assert.throws(
    () => addLog({}, tt, { code: 'DWC', date: '24/09/2026', text: 'algo', today: '2026-09-24' }),
    /Fecha no válida/,
  );
});

test('addLog rechaza texto vacío y recorta espacios', () => {
  assert.throws(
    () => addLog({}, tt, { code: 'DWC', text: '   ', today: '2026-09-24' }),
    /texto/i,
  );
  const out = addLog({}, tt, { code: 'DWC', text: '  DOM  ', today: '2026-09-24' });
  assert.equal(out.log[0].text, 'DOM');
});

test('weekSummary agrupa lo de la ventana y deja fuera lo anterior', () => {
  const manual = {
    log: [
      { date: '2026-09-10', code: 'DWC', text: 'viejo' },
      { date: '2026-09-21', code: 'DWC', text: 'DOM' },
      { date: '2026-09-24', code: 'DWC', text: 'eventos' },
      { date: '2026-09-23', code: 'DWS', text: 'PHP' },
    ],
  };
  const { byCode } = weekSummary(manual, tt, { today: '2026-09-24' });
  assert.deepEqual(byCode.DWC, [
    { date: '2026-09-21', text: 'DOM' },
    { date: '2026-09-24', text: 'eventos' },
  ]);
  assert.deepEqual(byCode.DWS, [{ date: '2026-09-23', text: 'PHP' }]);
  assert.equal(byCode.DIW, undefined, 'DIW no tiene entradas en la ventana');
});

test('weekSummary cuenta los días desde la última entrada de cada asignatura', () => {
  const manual = {
    log: [
      { date: '2026-09-10', code: 'DAW', text: 'viejo' },
      { date: '2026-09-21', code: 'DWC', text: 'DOM' },
      { date: '2026-09-24', code: 'DWS', text: 'PHP' },
    ],
  };
  const { sinceByCode } = weekSummary(manual, tt, { today: '2026-09-24' });
  assert.equal(sinceByCode.DWS, 0);
  assert.equal(sinceByCode.DWC, 3);
  assert.equal(sinceByCode.DAW, 14, 'cuenta también fuera de la ventana');
  assert.equal(sinceByCode.DIW, null, 'nunca tocada');
  assert.deepEqual(Object.keys(sinceByCode).sort(), Object.keys(tt.subjects).sort());
});

test('weekSummary acepta una ventana distinta y un manual sin log', () => {
  const manual = { log: [{ date: '2026-09-14', code: 'DWC', text: 'DOM' }] };
  assert.deepEqual(weekSummary(manual, tt, { today: '2026-09-24' }).byCode, {});
  assert.deepEqual(weekSummary(manual, tt, { today: '2026-09-24', days: 30 }).byCode, {
    DWC: [{ date: '2026-09-14', text: 'DOM' }],
  });
  const vacio = weekSummary({}, tt, { today: '2026-09-24' });
  assert.deepEqual(vacio.byCode, {});
  assert.equal(vacio.sinceByCode.DWC, null);
});
