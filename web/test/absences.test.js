import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { maxAllowed, lectiveDays, sessionsHeld, absenceReport, globalReport } from '../src/lib/absences.js';

const load = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const tt = load('timetable'), modules = load('modules'), calendar = load('calendar');

describe('maxAllowed', () => {
  it('mayor n con n/h < 15 %', () => {
    expect(maxAllowed(200, 15)).toBe(29);
    expect(maxAllowed(133, 15)).toBe(19);
    expect(maxAllowed(100, 15)).toBe(14);
    expect(maxAllowed(99, 15)).toBe(14);
    expect(maxAllowed(34, 15)).toBe(5);
  });
});

describe('lectiveDays', () => {
  it('excluye fines de semana y festivos', () => {
    const days = lectiveDays(calendar, '2026-10-05', '2026-10-16');
    expect(days).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });
  it('respeta el rango lectivo', () => {
    expect(lectiveDays(calendar, '2026-09-01', '2026-09-15')).toEqual(['2026-09-14', '2026-09-15']);
  });
});

describe('sessionsHeld', () => {
  it('cuenta sesiones impartidas de un módulo hasta una fecha', () => {
    // DWC: sep = 6/semana; la primera semana lectiva real es la del 14 (9, 10 y 11 son festivos),
    // así que del 14 al 25 hay 2 semanas completas.
    expect(sessionsHeld(tt, calendar, 'DWC', '2026-09-25')).toBe(12);
  });
});

describe('absenceReport', () => {
  const absences = [
    { date: '2026-09-16', code: 'DWC' },                          // miércoles sep: 2 sesiones
    { date: '2026-09-17', code: 'DWC', sessions: 1 },              // explícito
    { date: '2026-09-17', code: 'DWS', justified: true },          // jueves sep: 2 sesiones justificadas
    { date: '2026-10-05', code: 'DWC' },                           // lunes oct: 2 sesiones
  ];
  const r = absenceReport({ absences, timetable: tt, modules, calendar, today: '2026-10-06' });
  it('deduce sesiones del horario del día y respeta las explícitas', () => {
    const dwc = r.find((m) => m.code === 'DWC');
    expect(dwc.missed).toBe(5);
    expect(dwc.justified).toBe(0);
    expect(dwc.hours).toBe(200);
    expect(dwc.maxAllowed).toBe(29);
    expect(dwc.remaining).toBe(24);
    expect(dwc.percent).toBeCloseTo(2.5, 2);
    expect(dwc.lost).toBe(false);
  });
  it('las justificadas no cuentan para el límite pero se listan', () => {
    const dws = r.find((m) => m.code === 'DWS');
    expect(dws.missed).toBe(0);
    expect(dws.justified).toBe(2);
  });
  it('incluye porcentaje sobre lo impartido y nivel de alerta', () => {
    const dwc = r.find((m) => m.code === 'DWC');
    expect(dwc.held).toBeGreaterThan(0);
    expect(dwc.percentOfHeld).toBeGreaterThan(dwc.percent);
    expect(dwc.level).toBe('ok');
  });
  it('marca lost al llegar al 15 %', () => {
    const many = Array.from({ length: 15 }, () => ({ date: '2026-09-16', code: 'DWC', sessions: 2 }));
    const x = absenceReport({ absences: many, timetable: tt, modules, calendar, today: '2026-10-06' }).find((m) => m.code === 'DWC');
    expect(x.missed).toBe(30);
    expect(x.lost).toBe(true);
    expect(x.level).toBe('lost');
    expect(x.remaining).toBe(0);
  });
  it('niveles warn (>= 8 %) y danger (>= 12 %)', () => {
    const mk = (n) => absenceReport({ absences: [{ date: '2026-09-16', code: 'DIG', sessions: n }], timetable: tt, modules, calendar, today: '2026-10-06' }).find((m) => m.code === 'DIG');
    expect(mk(2).level).toBe('ok');      // 5.9 %
    expect(mk(3).level).toBe('warn');    // 8.8 %
    expect(mk(5).level).toBe('danger');  // 14.7 %
    expect(mk(6).level).toBe('lost');
  });
  it('todos los módulos aparecen aunque no tengan faltas, ordenados por porcentaje desc', () => {
    expect(r).toHaveLength(Object.keys(modules.modules).length);
    expect(r[0].code).toBe('DWC');
  });
});

describe('globalReport', () => {
  const base = { timetable: tt, modules, calendar, today: '2026-10-06' };
  it('suma horas y faltas de todos los módulos (1000 h, máximo 149)', () => {
    const g = globalReport(absenceReport({ ...base, absences: [
      { date: '2026-09-16', code: 'DWC' }, { date: '2026-09-15', code: 'SOS' }, { date: '2026-09-17', code: 'DWS', justified: true },
    ] }), 15);
    expect(g.hours).toBe(1000);
    expect(g.maxAllowed).toBe(149);
    expect(g.counted).toBe(3);
    expect(g.justified).toBe(2);
    expect(g.remaining).toBe(146);
    expect(g.percent).toBeCloseTo(0.3, 5);
    expect(g.level).toBe('ok');
    expect(g.held).toBeGreaterThan(0);
  });
  it('marca lost al 15 % global', () => {
    const g = globalReport(absenceReport({ ...base, absences: [{ date: '2026-09-16', code: 'DWC', sessions: 150 }] }), 15);
    expect(g.lost).toBe(true);
    expect(g.remaining).toBe(0);
  });
});
