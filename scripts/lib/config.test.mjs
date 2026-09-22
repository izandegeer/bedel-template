import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, DEFAULTS } from './config.mjs';

test('loadConfig devuelve los valores por defecto si no hay fichero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-'));
  const c = loadConfig(dir);
  assert.equal(c.pagesProject, DEFAULTS.pagesProject);
  assert.equal(c.root, dir);
  assert.equal(c.syncIntervalMinutes, 120);
});

test('loadConfig mezcla el fichero con los defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-'));
  writeFileSync(join(dir, 'bedel.config.json'), JSON.stringify({ pagesProject: 'mio' }));
  const c = loadConfig(dir);
  assert.equal(c.pagesProject, 'mio');
  assert.equal(c.workerConfig, 'wrangler.worker.toml');
});

test('loadConfig rechaza un fichero con JSON inválido con mensaje claro', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-'));
  writeFileSync(join(dir, 'bedel.config.json'), '{');
  assert.throws(() => loadConfig(dir), /bedel\.config\.json/);
});
