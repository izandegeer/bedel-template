import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildIcs } from '../src/lib/ics.js';

const tt = JSON.parse(readFileSync(new URL('./fixtures/timetable.json', import.meta.url)));

describe('buildIcs', () => {
  const ics = buildIcs({ ...tt, periods: undefined }, { from: '2026-09-14', until: '2027-06-18' });
  it('es un calendario válido con un VEVENT recurrente por clase', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(tt.classes.length);
  });
  it('usa zona Europe/Madrid, RRULE semanal y UNTIL', () => {
    expect(ics).toContain('DTSTART;TZID=Europe/Madrid:20260914T163000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270618T215959Z');
    expect(ics).toContain('SUMMARY:DIW, Diseño de Interfaces Web');
    expect(ics).toContain('LOCATION:Aula 03');
  });
  it('líneas terminadas en CRLF y sin exceder 75 octetos', () => {
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
  it('con periodos genera un VEVENT por clase y periodo, con UNTIL de cada periodo', () => {
    const full = buildIcs(tt);
    const total = tt.periods.reduce((n, p) => n + p.classes.length, 0);
    expect((full.match(/BEGIN:VEVENT/g) ?? []).length).toBe(total);
    expect(full).toContain('DTSTART;TZID=Europe/Madrid:20261005T153000');
    expect(full).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270531T215959Z');
    expect(full).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260930T215959Z');
  });
});
