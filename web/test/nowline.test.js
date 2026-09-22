import { describe, it, expect } from 'vitest';
import { nowPosition, rowFraction, elapsedColumns } from '../src/lib/nowline.js';
import { parseDate } from '../src/lib/dates.js';

/** Jueves del horario real: ING, DAW, DWC, descanso, DWC, DWS. */
const blocks = [
  ['16:30', '17:15'],
  ['17:15', '18:00'],
  ['18:00', '18:45'],
  ['19:05', '19:50'],
  ['19:50', '21:20'],
].map(([s, e]) => ({ start: parseDate(`2026-09-17T${s}`), end: parseDate(`2026-09-17T${e}`) }));

const at = (hhmm) => parseDate(`2026-09-17T${hhmm}`);

describe('nowPosition', () => {
  it('dentro de la primera clase', () => {
    expect(nowPosition(blocks, at('16:45'))).toEqual({ kind: 'in', index: 0, fraction: 15 / 45 });
  });
  it('dentro de una clase intermedia', () => {
    const p = nowPosition(blocks, at('18:20'));
    expect(p.kind).toBe('in');
    expect(p.index).toBe(2);
    expect(p.fraction).toBeCloseTo(20 / 45, 6);
  });
  it('en el descanso, hueco entre dos clases', () => {
    expect(nowPosition(blocks, at('18:55'))).toEqual({ kind: 'gap', after: 2, before: 3, fraction: 0.5 });
  });
  it('antes de todo', () => {
    expect(nowPosition(blocks, at('08:00'))).toEqual({ kind: 'outside' });
  });
  it('después de todo', () => {
    expect(nowPosition(blocks, at('22:00'))).toEqual({ kind: 'outside' });
  });
  it('justo en el final del último bloque queda fuera', () => {
    expect(nowPosition(blocks, at('21:20'))).toEqual({ kind: 'outside' });
  });
  it('justo en una frontera entra en el bloque siguiente', () => {
    expect(nowPosition(blocks, at('18:00'))).toEqual({ kind: 'in', index: 2, fraction: 0 });
    expect(nowPosition(blocks, at('16:30'))).toEqual({ kind: 'in', index: 0, fraction: 0 });
  });
  it('justo al empezar el descanso', () => {
    expect(nowPosition(blocks, at('18:45'))).toEqual({ kind: 'gap', after: 2, before: 3, fraction: 0 });
  });
  it('sin bloques no hay línea', () => {
    expect(nowPosition([], at('18:20'))).toEqual({ kind: 'outside' });
    expect(nowPosition(undefined, at('18:20'))).toEqual({ kind: 'outside' });
  });
});

/** Fronteras del jueves en minutos desde medianoche. */
const bounds = [990, 1035, 1080, 1125, 1145, 1190, 1280];

describe('rowFraction', () => {
  it('dentro de la primera fila', () => {
    expect(rowFraction(bounds, 990 + 15)).toEqual({ row: 0, fraction: 15 / 45 });
  });
  it('dentro de la fila de 18:00 a 18:45', () => {
    const r = rowFraction(bounds, 18 * 60 + 20);
    expect(r.row).toBe(2);
    expect(r.fraction).toBeCloseTo(20 / 45, 6);
  });
  it('dentro de la fila del descanso', () => {
    expect(rowFraction(bounds, 18 * 60 + 55)).toEqual({ row: 3, fraction: 0.5 });
  });
  it('antes de la primera frontera', () => {
    expect(rowFraction(bounds, 9 * 60)).toBe(null);
  });
  it('después de la última frontera', () => {
    expect(rowFraction(bounds, 22 * 60)).toBe(null);
    expect(rowFraction(bounds, 1280)).toBe(null);
  });
  it('justo en una frontera abre la fila siguiente', () => {
    expect(rowFraction(bounds, 1080)).toEqual({ row: 2, fraction: 0 });
    expect(rowFraction(bounds, 990)).toEqual({ row: 0, fraction: 0 });
  });
  it('sin fronteras suficientes no hay fila', () => {
    expect(rowFraction([990], 1000)).toBe(null);
    expect(rowFraction([], 1000)).toBe(null);
  });
});

/** Semana lunes-viernes que contiene el jueves 2026-09-17. */
const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']
  .map((key) => ({ key }));

describe('elapsedColumns', () => {
  it('semana actual, jueves por la tarde', () => {
    expect(elapsedColumns(week, at('18:20'))).toEqual({ pastDays: [0, 1, 2], today: 3 });
  });
  it('el lunes de la semana no deja días pasados', () => {
    expect(elapsedColumns(week, parseDate('2026-09-14T09:00'))).toEqual({ pastDays: [], today: 0 });
  });
  it('el fin de semana la semana entera queda pasada', () => {
    expect(elapsedColumns(week, parseDate('2026-09-19T12:00'))).toEqual({ pastDays: [0, 1, 2, 3, 4], today: null });
  });
  it('una semana pasada se sombrea entera', () => {
    expect(elapsedColumns(week, parseDate('2026-09-24T12:00'))).toEqual({ pastDays: [0, 1, 2, 3, 4], today: null });
  });
  it('una semana futura no se sombrea', () => {
    expect(elapsedColumns(week, parseDate('2026-09-10T12:00'))).toEqual({ pastDays: [], today: null });
  });
  it('acepta claves sueltas', () => {
    expect(elapsedColumns(week.map((d) => d.key), at('18:20'))).toEqual({ pastDays: [0, 1, 2], today: 3 });
  });
  it('sin días o sin instante no hay nada que sombrear', () => {
    expect(elapsedColumns([], at('18:20'))).toEqual({ pastDays: [], today: null });
    expect(elapsedColumns(undefined, at('18:20'))).toEqual({ pastDays: [], today: null });
    expect(elapsedColumns(week, null)).toEqual({ pastDays: [], today: null });
  });
});
