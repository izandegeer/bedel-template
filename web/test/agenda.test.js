import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { blocksOn, agendaAt, weekGrid, periodAt, sessionsOf } from '../src/lib/agenda.js';
import { parseDate, formatTime } from '../src/lib/dates.js';

const tt = JSON.parse(readFileSync(new URL('./fixtures/timetable.json', import.meta.url)));

describe('blocksOn', () => {
  it('lunes tiene 4 bloques ordenados con nombre, profe y color', () => {
    const b = blocksOn(tt, parseDate('2026-09-21T12:00'));   // lunes
    expect(b.map((x) => x.code)).toEqual(['DIW', 'DWC', 'DWC', 'PRO']);
    expect(b[0].name).toBe('Diseño de Interfaces Web');
    expect(b[0].teacher).toBe('Vicente Payá');
    expect(b[0].color).toBe('#A65A5A');
    expect(b[0].start.toISOString()).toBe('2026-09-21T14:30:00.000Z');
  });
  it('sábado no tiene bloques', () => {
    expect(blocksOn(tt, parseDate('2026-09-26T12:00'))).toEqual([]);
  });
});

describe('agendaAt', () => {
  it('hoy si quedan clases', () => {
    const a = agendaAt(tt, parseDate('2026-09-21T17:00'));
    expect(a.label).toBe('Hoy');
    expect(a.current.code).toBe('DIW');
    expect(a.next.code).toBe('DWC');
  });
  it('mañana si ya acabaron', () => {
    const a = agendaAt(tt, parseDate('2026-09-21T22:00'));
    expect(a.label).toBe('Mañana');
    expect(a.blocks[0].code).toBe('IPE');
  });
  it('viernes noche → Lunes', () => {
    expect(agendaAt(tt, parseDate('2026-09-25T22:00')).label).toBe('Lunes');
  });
});

describe('weekGrid', () => {
  it('devuelve 5 días con sus bloques', () => {
    const g = weekGrid(tt);
    expect(g).toHaveLength(5);
    expect(g[0].label).toBe('Lun');
    expect(g[4].blocks.map((b) => b.code)).toEqual(['IPE', 'DWS', 'ING', 'DIW']);
  });
});

describe('periodos', () => {
  it('un lunes de octubre usa el horario de oct-may', () => {
    const b = blocksOn(tt, parseDate('2026-10-05T12:00'));
    expect(b.map((x) => [x.code, formatTime(x.start), formatTime(x.end)])).toEqual([
      ['DIW', '15:30', '17:20'], ['DWC', '17:20', '18:15'], ['DWC', '18:35', '19:30'], ['PRO', '19:30', '21:20'],
    ]);
  });
  it('viernes de octubre empieza a las 14:35 con IPE', () => {
    expect(formatTime(blocksOn(tt, parseDate('2026-10-09T12:00'))[0].start)).toBe('14:35');
  });
  it('fuera de todos los periodos usa classes de respaldo', () => {
    expect(formatTime(blocksOn(tt, parseDate('2027-07-05T12:00'))[0].start)).toBe('16:30');
  });
  it('periodAt devuelve el periodo vigente y sessionsOf cuenta sesiones', () => {
    expect(periodAt(tt, parseDate('2026-10-05T12:00')).label).toBe('Octubre-mayo');
    expect(sessionsOf(tt, parseDate('2026-10-05T12:00'), 'DWC')).toBe(2);
    expect(sessionsOf(tt, parseDate('2026-09-21T12:00'), 'DWC')).toBe(2);
    expect(sessionsOf(tt, parseDate('2026-10-05T12:00'), 'DWS')).toBe(0);
  });
  it('weekGrid acepta una fecha y usa su periodo', () => {
    expect(weekGrid(tt, parseDate('2026-10-05T12:00'))[4].blocks[0].code).toBe('IPE');
    expect(weekGrid(tt, parseDate('2026-09-21T12:00'))[4].blocks[0].code).toBe('IPE');
    expect(formatTime(weekGrid(tt, parseDate('2026-10-05T12:00'))[4].blocks[0].start)).toBe('14:35');
  });
});
