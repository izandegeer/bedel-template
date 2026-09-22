import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './run.mjs';

test('run devuelve código 0 y la salida del comando', () => {
  const r = run(process.execPath, ['-e', 'console.log("hola")'], { quiet: true });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'hola');
});

test('run devuelve el código de salida y stderr cuando el comando falla', () => {
  const r = run(process.execPath, ['-e', 'console.error("mal"); process.exit(3)'], { quiet: true });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /mal/);
});

test('run pasa la entrada por stdin', () => {
  const r = run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'eco', quiet: true });
  assert.equal(r.stdout, 'eco');
});

test('run con inherit deja la salida al terminal y no la captura', () => {
  const r = run(process.execPath, ['-e', 'process.exit(4)'], { inherit: true });
  assert.equal(r.code, 4);
  assert.equal(r.stdout, '');
});
