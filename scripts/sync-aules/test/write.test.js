// scripts/sync-aules/test/write.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stableStringify, writeJson } from '../lib/write.js';

test('stableStringify ordena claves recursivamente y termina en salto de línea', () => {
  const s = stableStringify({ b: 1, a: { d: [ { z: 1, y: 2 } ], c: null } });
  assert.equal(s, '{\n  "a": {\n    "c": null,\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
});

test('writeJson devuelve true si el fichero cambió y false si no', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-'));
  const file = join(dir, 'x.json');
  assert.equal(writeJson(file, { a: 1 }), true);
  assert.equal(writeJson(file, { a: 1 }), false);
  assert.equal(writeJson(file, { a: 2 }), true);
  assert.equal(readFileSync(file, 'utf8'), '{\n  "a": 2\n}\n');
});
