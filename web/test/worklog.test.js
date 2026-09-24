import { describe, it, expect } from 'vitest';
import { weekSummary, label } from '../src/lib/worklog.js';

const subjects = {
  DIW: { name: 'Diseño de Interfaces Web', color: '#A65A5A' },
  DWC: { name: 'Desarrollo Web Entorno Cliente', color: '#C9A800' },
  DWS: { name: 'Desarrollo Web Entorno Servidor', color: '#2F7FC9' },
};

const log = [
  { date: '2026-09-01', code: 'DWS', text: 'fuera de la ventana' },
  { date: '2026-09-17', code: 'DIW', text: 'hace una semana justa' },
  { date: '2026-09-21', code: 'DWC', text: 'actividades 1-6 del DOM' },
  { date: '2026-09-24', code: 'DWC', text: 'eventos y listeners' },
];

describe('weekSummary', () => {
  const r = weekSummary(log, subjects, { today: '2026-09-24' });

  it('agrupa por asignatura solo las entradas dentro de la ventana', () => {
    expect(Object.keys(r.byCode)).toEqual(['DWC']);
    expect(r.byCode.DWC).toEqual([
      { date: '2026-09-21', text: 'actividades 1-6 del DOM' },
      { date: '2026-09-24', text: 'eventos y listeners' },
    ]);
  });

  it('deja fuera lo anterior a la ventana', () => {
    expect(r.byCode.DWS).toBeUndefined();
    expect(r.byCode.DIW).toBeUndefined();
  });

  it('respeta la ventana configurable', () => {
    const wide = weekSummary(log, subjects, { today: '2026-09-24', days: 30 });
    expect(Object.keys(wide.byCode).sort()).toEqual(['DIW', 'DWC', 'DWS']);
  });

  it('incluye todas las asignaturas en since, con null si nunca se tocó', () => {
    const codes = r.since.map((s) => s.code);
    expect(codes.sort()).toEqual(['DIW', 'DWC', 'DWS']);
    const byCode = Object.fromEntries(r.since.map((s) => [s.code, s]));
    expect(byCode.DWC.days).toBe(0);
    expect(byCode.DIW.days).toBe(7);
    expect(byCode.DWS.days).toBe(23);
    expect(byCode.DWC.name).toBe('Desarrollo Web Entorno Cliente');
  });

  it('ordena since de más abandonada a más reciente, nunca primero', () => {
    const sinDWS = weekSummary(log.slice(1), subjects, { today: '2026-09-24' });
    expect(sinDWS.since.map((s) => [s.code, s.days])).toEqual([
      ['DWS', null],
      ['DIW', 7],
      ['DWC', 0],
    ]);
  });

  it('ignora entradas con fecha futura al calcular los días', () => {
    const conFuturo = [...log, { date: '2026-10-01', code: 'DWS', text: 'aún no' }];
    const byCode = Object.fromEntries(weekSummary(conFuturo, subjects, { today: '2026-09-24' }).since.map((s) => [s.code, s]));
    expect(byCode.DWS.days).toBe(23);
  });

  it('trata un log vacío o ausente como sin entradas', () => {
    for (const vacio of [[], null, undefined]) {
      const r2 = weekSummary(vacio, subjects, { today: '2026-09-24' });
      expect(r2.byCode).toEqual({});
      expect(r2.since.every((s) => s.days === null)).toBe(true);
      expect(r2.since).toHaveLength(3);
    }
  });

  it('ignora códigos que no son asignaturas del curso', () => {
    const r2 = weekSummary([{ date: '2026-09-24', code: 'XXX', text: 'nada' }], subjects, { today: '2026-09-24' });
    expect(r2.byCode).toEqual({});
  });
});

describe('label', () => {
  it('describe los días en español', () => {
    expect(label(0)).toBe('hoy');
    expect(label(1)).toBe('ayer');
    expect(label(3)).toBe('hace 3 días');
    expect(label(null)).toBe('nunca');
  });
});
