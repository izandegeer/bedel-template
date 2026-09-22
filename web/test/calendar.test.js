import { describe, it, expect } from 'vitest';
import { monthGrid, itemsByDay, monthLabel, shiftMonth, keyOf, weekOf, shiftWeek, weekLabel } from '../src/lib/calendar.js';
import { parseDate } from '../src/lib/dates.js';

describe('monthGrid', () => {
  it('siempre 42 días en 6 semanas empezando en lunes', () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(42);
    expect(g[0].key).toBe('2026-08-31');       // lunes previo
    expect(g[41].key).toBe('2026-10-11');
  });
  it('marca los días del mes y los fines de semana', () => {
    const g = monthGrid(2026, 9);
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
    expect(g.find((d) => d.key === '2026-09-01').inMonth).toBe(true);
    expect(g.find((d) => d.key === '2026-08-31').inMonth).toBe(false);
    expect(g.find((d) => d.key === '2026-09-05').isWeekend).toBe(true);
    expect(g.find((d) => d.key === '2026-09-06').isWeekend).toBe(true);
    expect(g.find((d) => d.key === '2026-09-04').isWeekend).toBe(false);
  });
  it('un mes que empieza en lunes no añade días previos', () => {
    const g = monthGrid(2027, 2);   // 1 feb 2027 es lunes
    expect(g[0].key).toBe('2027-02-01');
  });
});

describe('monthLabel y shiftMonth', () => {
  it('capitaliza el mes en es-ES', () => {
    expect(monthLabel(2026, 9)).toBe('Septiembre 2026');
  });
  it('cruza el año', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('itemsByDay', () => {
  const deadlines = [
    { id: 'a', code: 'PRO', due: parseDate('2026-09-23') },
    { id: 'b', code: 'DWS', due: parseDate('2026-09-23T10:00') },
    { id: 'c', code: 'DIG', due: null },
  ];
  const events = [
    { date: '2026-09-30', type: 'examen', text: 'Examen DIG', code: 'DIG' },
    { date: '2026-10-09', type: 'festivo', text: "9 d'Octubre" },
    { date: '2026-12-01', type: 'info', text: '1ª evaluación' },
  ];
  it('agrupa entregas por su día en Madrid', () => {
    const m = itemsByDay(deadlines, events);
    expect(m.get('2026-09-23').deadlines.map((d) => d.id)).toEqual(['a', 'b']);
    expect(keyOf(parseDate('2026-09-23'))).toBe('2026-09-23');   // 23:59 Madrid, no se va al día siguiente
  });
  it('ignora entregas sin fecha', () => {
    const m = itemsByDay(deadlines, []);
    expect([...m.keys()]).toEqual(['2026-09-23']);
  });
  it('separa festivos, exámenes y otros eventos', () => {
    const m = itemsByDay([], events);
    expect(m.get('2026-09-30').exams).toHaveLength(1);
    expect(m.get('2026-10-09').holidays).toHaveLength(1);
    expect(m.get('2026-12-01').others).toHaveLength(1);
    expect(m.get('2026-12-01').exams).toEqual([]);
  });
  it('tolera argumentos vacíos', () => {
    expect(itemsByDay().size).toBe(0);
  });
});

describe('weekOf', () => {
  it('devuelve 7 días de lunes a domingo', () => {
    const w = weekOf('2026-09-30');   // miércoles
    expect(w.map((d) => d.key)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
  });
  it('un lunes es el primer día de su propia semana', () => {
    expect(weekOf('2026-09-28')[0].key).toBe('2026-09-28');
  });
  it('un domingo cierra su semana', () => {
    const w = weekOf('2026-10-04');
    expect(w[0].key).toBe('2026-09-28');
    expect(w[6].key).toBe('2026-10-04');
  });
  it('marca el fin de semana y expone los componentes de fecha', () => {
    const w = weekOf('2026-09-30');
    expect(w.map((d) => d.isWeekend)).toEqual([false, false, false, false, false, true, true]);
    expect(w[3]).toMatchObject({ year: 2026, month: 10, day: 1 });
  });
  it('rechaza claves inválidas', () => {
    expect(() => weekOf('2026-9-1')).toThrow();
  });
});

describe('shiftWeek', () => {
  it('avanza y retrocede 7 días', () => {
    expect(shiftWeek('2026-09-30', 1)).toBe('2026-10-07');
    expect(shiftWeek('2026-09-30', -1)).toBe('2026-09-23');
  });
  it('cruza el año', () => {
    expect(shiftWeek('2026-12-30', 1)).toBe('2027-01-06');
  });
});

describe('weekLabel', () => {
  it('semana dentro de un mes', () => {
    expect(weekLabel(weekOf('2026-09-23'))).toBe('21-27 sept 2026');
  });
  it('semana a caballo entre dos meses', () => {
    expect(weekLabel(weekOf('2026-09-30'))).toBe('28 sept - 4 oct 2026');
  });
  it('semana a caballo entre dos años', () => {
    expect(weekLabel(weekOf('2026-12-31'))).toBe('28 dic 2026 - 3 ene 2027');
  });
  it('acepta claves sueltas y tolera listas vacías', () => {
    expect(weekLabel(['2026-09-21', '2026-09-27'])).toBe('21-27 sept 2026');
    expect(weekLabel([])).toBe('');
  });
});
