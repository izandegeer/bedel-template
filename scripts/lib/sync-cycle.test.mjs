import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv, syncCycle } from './sync-cycle.mjs';

// Doble de run: registra las llamadas y devuelve el código que se le indique por comando.
// La clave se busca como subcadena de "cmd arg1 arg2 ...", la primera que encaje gana.
function dobleRun(codigos = {}) {
  const llamadas = [];
  const run = (cmd, args, opts = {}) => {
    llamadas.push([cmd, ...args].join(' '));
    run.opciones.push(opts);
    const clave = [cmd, ...args].join(' ');
    const entrada = Object.entries(codigos).find(([k]) => clave.includes(k));
    const valor = entrada ? entrada[1] : 0;
    // Un valor puede ser un código fijo o una lista de códigos, uno por llamada.
    const code = Array.isArray(valor) ? (valor.shift() ?? 0) : valor;
    return { code, stdout: '', stderr: '' };
  };
  run.llamadas = llamadas;
  run.opciones = [];
  return run;
}

// Crea un repo de mentira con .env y data/config.json.
function repoFalso({ env = 'AULES_TOKEN=abc123\n' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-sync-'));
  if (env !== null) writeFileSync(join(dir, '.env'), env);
  return dir;
}

function config(root) {
  return { root, pagesProject: 'bedel', workerConfig: 'wrangler.worker.toml', nodeBin: '/bin/node' };
}

// Contexto por defecto: red ok, deploy ok, sin esperas reales.
function contexto(run, extra = {}) {
  const registro = [];
  const despliegues = [];
  return {
    run,
    fetch: async () => ({ ok: true, status: 200 }),
    log: (t) => registro.push(t),
    env: {},
    deploy: (cfg) => { despliegues.push(cfg.root); return { pages: 'ok', worker: 'ok' }; },
    sleep: async () => {},
    registro,
    despliegues,
    ...extra,
  };
}

test('parseEnv lee KEY=VALUE e ignora comentarios y líneas vacías', () => {
  const r = parseEnv('# comentario\n\nAULES_TOKEN=abc\nOTRA = 2 \n');
  assert.deepEqual(r, { AULES_TOKEN: 'abc', OTRA: '2' });
});

test('parseEnv admite comillas simples y dobles y el prefijo export', () => {
  const r = parseEnv('A="con espacios"\nB=\'otro\'\nexport C=3\nsin_igual\n');
  assert.deepEqual(r, { A: 'con espacios', B: 'otro', C: '3' });
});

test('parseEnv no parte el valor en el segundo igual', () => {
  assert.equal(parseEnv('A=b=c').A, 'b=c');
});

test('sin .env con AULES_TOKEN devuelve sin-token y no toca git', async () => {
  const root = repoFalso({ env: null });
  const run = dobleRun();
  const ctx = contexto(run);
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'sin-token');
  assert.deepEqual(run.llamadas, []);
  assert.ok(ctx.registro.some((l) => l.includes('AULES_TOKEN')));
});

test('sin red devuelve sin-red y no llama a git', async () => {
  const root = repoFalso();
  const run = dobleRun();
  const ctx = contexto(run, { fetch: async () => { throw new Error('offline'); } });
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'sin-red');
  assert.deepEqual(run.llamadas, []);
  assert.ok(ctx.registro.includes('Aules no accesible, se omite'));
});

test('la comprobación de red usa la baseUrl de data/config.json con timeout', async () => {
  const root = repoFalso();
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'config.json'), JSON.stringify({ baseUrl: 'https://ejemplo.test/fp' }));
  const urls = [];
  const run = dobleRun();
  const ctx = contexto(run, { fetch: async (url, opts) => { urls.push([url, opts]); throw new Error('offline'); } });
  await syncCycle(config(root), ctx);
  assert.equal(urls[0][0], 'https://ejemplo.test/fp/');
  assert.ok(urls[0][1].signal);
});

test('si el pull falla aborta el rebase y devuelve pull-fallido', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git pull': 1 });
  const ctx = contexto(run);
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'pull-fallido');
  assert.ok(run.llamadas.includes('git rebase --abort'));
  assert.equal(ctx.despliegues.length, 0);
});

test('lanza el sync de Aules con nodeBin, cwd en el repo y el token en env', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 0 });
  const ctx = contexto(run);
  await syncCycle(config(root), ctx);
  const i = run.llamadas.indexOf('/bin/node scripts/sync-aules/sync.js');
  assert.ok(i > 0, 'debe llamar al sync de Aules');
  assert.equal(run.opciones[i].cwd, root);
  assert.equal(run.opciones[i].env.AULES_TOKEN, 'abc123');
});

test('si el sync de Aules falla devuelve sync-fallido y no commitea', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'sync-aules/sync.js': 1 });
  const r = await syncCycle(config(root), contexto(run));
  assert.equal(r.status, 'sync-fallido');
  assert.ok(!run.llamadas.some((l) => l.startsWith('git commit')));
});

test('sin cambios preparados no commitea ni despliega', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 0 });
  const ctx = contexto(run);
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'sin-cambios');
  assert.ok(run.llamadas.includes('git add data/aules'));
  assert.ok(!run.llamadas.some((l) => l.startsWith('git commit')));
  assert.equal(ctx.despliegues.length, 0);
  assert.ok(ctx.registro.includes('Sin cambios'));
});

test('si solo cambia meta.json el mensaje dice sin cambios de datos', async () => {
  const root = repoFalso();
  // Hay cambios preparados (code 1) pero ninguno fuera de meta.json (code 0).
  const run = dobleRun({ "git diff --cached --quiet -- :!data/aules/meta.json": 0, 'git diff --cached --quiet': 1 });
  const r = await syncCycle(config(root), contexto(run));
  assert.equal(r.status, 'ok');
  assert.match(r.message, /^sync: sin cambios de datos \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  assert.ok(run.llamadas.includes(`git commit -q -m ${r.message}`));
});

test('con cambios de datos el mensaje es sync: aules y despliega tras el push', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 1 });
  const ctx = contexto(run);
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'ok');
  assert.match(r.message, /^sync: aules \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  assert.equal(r.pages, 'ok');
  assert.equal(r.worker, 'ok');
  assert.deepEqual(ctx.despliegues, [root]);
  assert.ok(ctx.registro.some((l) => l.startsWith('push ok: sync: aules')));
});

test('si el push falla tres veces devuelve push-fallido y no despliega', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 1, 'git push': 1 });
  const ctx = contexto(run);
  const esperas = [];
  ctx.sleep = async (ms) => { esperas.push(ms); };
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'push-fallido');
  assert.equal(run.llamadas.filter((l) => l === 'git push -q').length, 3);
  assert.equal(esperas.length, 2);
  assert.equal(esperas[0], 10000);
  assert.equal(ctx.despliegues.length, 0);
  assert.ok(ctx.registro.includes('No se pudo hacer push'));
});

test('el push que falla al primer intento y va al segundo acaba en ok', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 1, 'git push': [1, 0] });
  const ctx = contexto(run);
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'ok');
  assert.ok(ctx.registro.includes('push fallido (intento 1)'));
  assert.deepEqual(ctx.despliegues, [root]);
});

test('un deploy con fallo no rompe el ciclo y lo avisa', async () => {
  const root = repoFalso();
  const run = dobleRun({ 'git diff --cached --quiet': 1 });
  const ctx = contexto(run, { deploy: () => ({ pages: 'ok', worker: 'deploy en Workers fallido' }) });
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'ok');
  assert.equal(r.worker, 'deploy en Workers fallido');
  assert.ok(ctx.registro.includes('deploy web fallido (no bloquea)'));
});

test('soloDeploy salta Aules y git y solo despliega', async () => {
  const root = repoFalso({ env: null });
  const run = dobleRun();
  const ctx = contexto(run, { soloDeploy: true });
  const r = await syncCycle(config(root), ctx);
  assert.equal(r.status, 'ok');
  assert.deepEqual(run.llamadas, []);
  assert.deepEqual(ctx.despliegues, [root]);
});

test('la primera línea del registro es la de inicio', async () => {
  const root = repoFalso({ env: null });
  const run = dobleRun();
  const ctx = contexto(run);
  await syncCycle(config(root), ctx);
  assert.match(ctx.registro[0], /^== \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} inicio$/);
});
