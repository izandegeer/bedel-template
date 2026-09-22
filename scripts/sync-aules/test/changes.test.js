import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChanges, mergeChanges } from '../lib/changes.js';

const a = (id, due, title = 'T') => ({ id, code: 'DWS', title, due, url: 'u', submitted: false, graded: false });
const NOW = '2026-09-17T10:00:00.000Z';

test('detecta tareas nuevas y cambios de fecha, ignora lo demás', () => {
  const prev = [a('aules-1', '2026-09-23T23:59:00+02:00'), a('aules-2', '2026-09-30T23:59:00+02:00'), a('aules-3', null)];
  const next = [a('aules-1', '2026-09-23T23:59:00+02:00'), a('aules-2', '2026-10-07T23:59:00+02:00'), a('aules-3', null), a('aules-4', '2026-10-01T23:59:00+02:00', 'Nueva')];
  assert.deepEqual(detectChanges(prev, next, NOW), [
    { id: 'aules-2', code: 'DWS', title: 'T', type: 'due', from: '2026-09-30T23:59:00+02:00', to: '2026-10-07T23:59:00+02:00', at: NOW },
    { id: 'aules-4', code: 'DWS', title: 'Nueva', type: 'new', due: '2026-10-01T23:59:00+02:00', at: NOW },
  ]);
});

test('sin lista previa no se registra nada (primera sincronización)', () => {
  assert.deepEqual(detectChanges(null, [a('aules-1', null)], NOW), []);
});

test('mergeChanges añade los nuevos, deduplica y descarta los de más de 30 días', () => {
  const old = [{ id: 'aules-9', type: 'new', at: '2026-08-01T00:00:00.000Z' }, { id: 'aules-2', type: 'due', from: 'x', to: 'y', at: '2026-09-10T00:00:00.000Z' }];
  const fresh = [{ id: 'aules-2', type: 'due', from: 'x', to: 'y', at: NOW }, { id: 'aules-4', type: 'new', at: NOW }];
  const out = mergeChanges(old, fresh, NOW);
  assert.deepEqual(out.map((c) => [c.id, c.type, c.at]), [
    ['aules-2', 'due', NOW], ['aules-4', 'new', NOW],
  ]);
});
