import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb, commitAndDeploy, deployAll, deployPages, deployWorker, extraerWorkerUrl } from './deploy.mjs';

// Doble de run: registra las llamadas y devuelve el código que se le indique por comando.
function dobleRun(codigos = {}, salidas = {}) {
  const llamadas = [];
  const run = (cmd, args, opts = {}) => {
    llamadas.push([cmd, args, opts.cwd]);
    const clave = [cmd, ...args].join(' ');
    const entrada = Object.entries(codigos).find(([k]) => clave.includes(k));
    const salida = Object.entries(salidas).find(([k]) => clave.includes(k));
    return { code: entrada ? entrada[1] : 0, stdout: salida ? salida[1] : '', stderr: '' };
  };
  run.llamadas = llamadas;
  return run;
}

const cfg = { root: '/repo', pagesProject: 'bedel', workerConfig: 'wrangler.worker.toml' };

test('deployPages llama a wrangler pages deploy con cwd en web/', () => {
  const run = dobleRun();
  deployPages(cfg, run);
  assert.deepEqual(run.llamadas, [[
    'npx',
    ['-y', 'wrangler@latest', 'pages', 'deploy', 'dist', '--project-name', 'bedel', '--branch', 'main', '--commit-dirty=true'],
    join('/repo', 'web'),
  ]]);
});

test('deployWorker llama a wrangler deploy con el config del worker', () => {
  const run = dobleRun();
  deployWorker(cfg, run);
  assert.deepEqual(run.llamadas, [[
    'npx',
    ['-y', 'wrangler@latest', 'deploy', '--config', 'wrangler.worker.toml'],
    join('/repo', 'web'),
  ]]);
});

test('deployPages lanza error si wrangler falla', () => {
  const run = dobleRun({ 'pages deploy': 1 });
  assert.throws(() => deployPages(cfg, run), /Pages/);
});

test('deployAll despliega en Workers aunque falle Pages', () => {
  const run = dobleRun({ 'pages deploy': 1 });
  const r = deployAll({ ...cfg, root: mkRepo() }, run);
  assert.match(r.pages, /Pages/);
  assert.equal(r.worker, 'ok');
  const comandos = run.llamadas.map(([cmd, args]) => [cmd, ...args].join(' '));
  assert.ok(comandos.some((c) => c.includes('pages deploy')));
  assert.ok(comandos.some((c) => c.includes('wrangler@latest deploy --config')));
});

test('deployAll devuelve ok en los dos destinos si todo va bien', () => {
  const run = dobleRun();
  assert.deepEqual(deployAll({ ...cfg, root: mkRepo() }, run), { pages: 'ok', worker: 'ok', workerUrl: null });
});

test('extraerWorkerUrl saca la URL de workers.dev de la salida de wrangler', () => {
  const salida = [
    'Total Upload: 120.00 KiB / gzip: 40.00 KiB',
    'Deployed bedel triggers (1.20 sec)',
    '  https://bedel.mi-cuenta.workers.dev',
    'Current Version ID: abc-123',
  ].join('\n');
  assert.equal(extraerWorkerUrl(salida), 'https://bedel.mi-cuenta.workers.dev');
});

test('extraerWorkerUrl devuelve null si no hay ninguna URL de Workers', () => {
  assert.equal(extraerWorkerUrl('Deployed bedel triggers\nhttps://bedel.pages.dev'), null);
});

test('deployAll devuelve la URL de Workers parseada de la salida de wrangler', () => {
  const run = dobleRun({}, { 'wrangler@latest deploy --config': 'Deployed bedel triggers\n  https://bedel.mi-cuenta.workers.dev\n' });
  const r = deployAll({ ...cfg, root: mkRepo() }, run);
  assert.equal(r.workerUrl, 'https://bedel.mi-cuenta.workers.dev');
});

// Repo falso mínimo: data/ con JSON, web/public y web/functions.
function mkRepo({ conNodeModules = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bedel-deploy-'));
  mkdirSync(join(root, 'data', 'aules'), { recursive: true });
  writeFileSync(join(root, 'data', 'manual.json'), '{"absences":[]}');
  writeFileSync(join(root, 'data', 'notas.txt'), 'no es json');
  writeFileSync(join(root, 'data', 'aules', 'meta.json'), '{"syncedAt":"2026-09-22T10:00:00Z"}');
  mkdirSync(join(root, 'web', 'public'), { recursive: true });
  mkdirSync(join(root, 'web', 'functions'), { recursive: true });
  writeFileSync(join(root, 'web', 'functions', '_middleware.js'), '// falso');
  if (conNodeModules) mkdirSync(join(root, 'web', 'node_modules'), { recursive: true });
  return root;
}

test('buildWeb copia los datos, prepara dist y escribe .assetsignore', () => {
  const root = mkRepo();
  const run = dobleRun();
  buildWeb({ ...cfg, root }, run);
  const pub = join(root, 'web', 'public', 'data');
  assert.ok(existsSync(join(pub, 'manual.json')));
  assert.ok(existsSync(join(pub, 'aules', 'meta.json')));
  assert.ok(!existsSync(join(pub, 'notas.txt')), 'solo se copian los .json');
  assert.ok(existsSync(join(root, 'web', 'dist', 'functions', '_middleware.js')));
  assert.equal(readFileSync(join(root, 'web', 'dist', '.assetsignore'), 'utf8'), 'functions\n');
});

test('buildWeb ejecuta npm ci si falta node_modules y luego npm run build', () => {
  const root = mkRepo();
  const run = dobleRun();
  buildWeb({ ...cfg, root }, run);
  const comandos = run.llamadas.map(([cmd, args]) => [cmd, ...args].join(' '));
  assert.deepEqual(comandos, ['npm ci', 'npm run build']);
  assert.equal(run.llamadas[0][2], join(root, 'web'));
});

test('buildWeb no ejecuta npm ci si ya hay node_modules', () => {
  const root = mkRepo({ conNodeModules: true });
  const run = dobleRun();
  buildWeb({ ...cfg, root }, run);
  assert.deepEqual(run.llamadas.map(([cmd, args]) => [cmd, ...args].join(' ')), ['npm run build']);
});

test('buildWeb lanza error si npm run build falla', () => {
  const run = dobleRun({ 'npm run build': 1 });
  assert.throws(() => buildWeb({ ...cfg, root: mkRepo({ conNodeModules: true }) }, run), /build/);
});

test('commitAndDeploy commitea, hace pull y push, y despliega', () => {
  const root = mkRepo();
  // code 1 en git diff --cached --quiet significa que hay cambios preparados.
  const run = dobleRun({ 'git diff --cached --quiet': 1 });
  const r = commitAndDeploy({ ...cfg, root }, run, ['data/manual.json'], 'faltas: DWS');
  const comandos = run.llamadas.map(([cmd, args]) => [cmd, ...args].join(' '));
  assert.deepEqual(comandos.filter((c) => c.startsWith('git')), [
    'git add data/manual.json',
    'git diff --cached --quiet -- data/manual.json',
    'git commit -q -m faltas: DWS',
    'git pull --rebase --autostash',
    'git push',
  ]);
  assert.equal(run.llamadas[0][2], root);
  assert.deepEqual(r, { committed: true, pages: 'ok', worker: 'ok', workerUrl: null });
});

test('commitAndDeploy no commitea si no hay cambios pero sí despliega', () => {
  const root = mkRepo();
  const run = dobleRun(); // git diff --cached --quiet devuelve 0: sin cambios
  const r = commitAndDeploy({ ...cfg, root }, run, ['data/manual.json'], 'faltas: DWS');
  const comandos = run.llamadas.map(([cmd, args]) => [cmd, ...args].join(' '));
  assert.ok(!comandos.some((c) => c.startsWith('git commit')), 'no debe commitear');
  assert.ok(comandos.includes('git push'));
  assert.equal(r.committed, false);
  assert.equal(r.pages, 'ok');
});
