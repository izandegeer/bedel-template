// scripts/sync-aules/test/params.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../lib/params.js';

test('valores simples se copian tal cual', () => {
  assert.deepEqual(flatten({ userid: 5, name: 'x' }), { userid: '5', name: 'x' });
});

test('arrays se aplanan con índices', () => {
  assert.deepEqual(flatten({ courseids: [12, 13] }), {
    'courseids[0]': '12',
    'courseids[1]': '13',
  });
});

test('objetos anidados se aplanan con claves', () => {
  assert.deepEqual(flatten({ options: [{ name: 'a', value: 1 }] }), {
    'options[0][name]': 'a',
    'options[0][value]': '1',
  });
});

test('null y undefined se omiten', () => {
  assert.deepEqual(flatten({ a: null, b: undefined, c: 0 }), { c: '0' });
});
