import { describe, it, expect } from 'vitest';
import { parseDate, formatDay, formatTime, daysUntil, madridParts } from '../src/lib/dates.js';

describe('parseDate', () => {
  it('ISO con offset', () => {
    expect(parseDate('2026-09-27T23:59:00+02:00').toISOString()).toBe('2026-09-27T21:59:00.000Z');
  });
  it('ISO con milisegundos y Z (meta.syncedAt)', () => {
    expect(parseDate('2026-09-17T07:18:06.079Z').toISOString()).toBe('2026-09-17T07:18:06.079Z');
  });
  it('local sin offset se interpreta en Madrid (verano +02)', () => {
    expect(parseDate('2026-09-25T23:59').toISOString()).toBe('2026-09-25T21:59:00.000Z');
  });
  it('local sin offset en invierno (+01)', () => {
    expect(parseDate('2026-01-15T23:59').toISOString()).toBe('2026-01-15T22:59:00.000Z');
  });
  it('solo fecha → 23:59 Madrid', () => {
    expect(parseDate('2026-09-25').toISOString()).toBe('2026-09-25T21:59:00.000Z');
  });
  it('null, vacío o inválido → null', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('ayer')).toBeNull();
  });
});

describe('formato y cuenta atrás', () => {
  const d = parseDate('2026-09-27T23:59:00+02:00');
  it('formatDay y formatTime en español y Madrid', () => {
    expect(formatDay(d)).toBe('dom 27 sept');
    expect(formatTime(d)).toBe('23:59');
  });
  it('daysUntil cuenta días de calendario en Madrid', () => {
    const now = parseDate('2026-09-25T10:00');
    expect(daysUntil(d, now)).toBe(2);
    expect(daysUntil(parseDate('2026-09-25T23:00'), now)).toBe(0);
    expect(daysUntil(parseDate('2026-09-24T23:00'), now)).toBe(-1);
  });
  it('madridParts devuelve y/m/d/h/min/weekday', () => {
    expect(madridParts(d)).toEqual({ year: 2026, month: 9, day: 27, hour: 23, minute: 59, weekday: 6 });
  });
});
