import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeDeadlines, pending } from '../src/lib/deadlines.js';
import { parseDate } from '../src/lib/dates.js';

const aules = JSON.parse(readFileSync(new URL('./fixtures/assignments.json', import.meta.url)));
const manual = JSON.parse(readFileSync(new URL('./fixtures/manual.json', import.meta.url)));

describe('mergeDeadlines', () => {
  const merged = mergeDeadlines(aules, manual);
  it('une Aules y manual, ordenado por fecha, sin fecha al final', () => {
    expect(merged.map((d) => d.id)).toEqual(['man-001', 'aules-501', 'aules-502', 'aules-503']);
  });
  it('marca done por lista done o por submitted', () => {
    const byId = Object.fromEntries(merged.map((d) => [d.id, d]));
    expect(byId['aules-501'].done).toBe(true);
    expect(byId['aules-502'].done).toBe(true);
    expect(byId['man-001'].done).toBe(false);
  });
  it('conserva origen y estado de Aules', () => {
    const byId = Object.fromEntries(merged.map((d) => [d.id, d]));
    expect(byId['man-001'].source).toBe('manual');
    expect(byId['aules-502'].submitted).toBe(true);
  });
  it('deduplica ids (gana el primero)', () => {
    const dup = mergeDeadlines(aules, { ...manual, deadlines: [{ id: 'aules-501', code: 'X', title: 'dup', due: '2026-01-01' }] });
    expect(dup.filter((d) => d.id === 'aules-501')).toHaveLength(1);
    expect(dup.find((d) => d.id === 'aules-501').code).toBe('DWS');
  });
});

describe('pending', () => {
  it('excluye hechas y sin fecha, incluye hasta 1 día vencidas', () => {
    const merged = mergeDeadlines(aules, manual);
    const now = parseDate('2026-09-20T00:00');
    expect(pending(merged, now).map((d) => d.id)).toEqual(['man-001']);
  });
});
