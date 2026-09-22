import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stepCloudflare, stepConfig, stepDeploy, stepFirstSync, stepSchedule, stepToken,
} from './setup-steps.mjs';

// Raíz falsa: solo lo que los pasos necesitan leer, data/config.json con una URL de mentira.
function mkRoot({ env, config } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bedel-setup-'));
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'web'), { recursive: true });
  writeFileSync(join(root, 'data', 'config.json'), JSON.stringify({ baseUrl: 'https://aules.test/fp', courses: {} }));
  if (env != null) writeFileSync(join(root, '.env'), env);
  if (config != null) writeFileSync(join(root, 'bedel.config.json'), config);
  return root;
}

function mkCfg(root, extra = {}) {
  return {
    root,
    pagesProject: 'bedel-test',
    workerConfig: 'wrangler.worker.toml',
    syncIntervalMinutes: 120,
    logFile: 'logs/sync.log',
    nodeBin: '/usr/bin/node',
    ...extra,
  };
}

// Doble de run: registra las llamadas y devuelve lo que se le indique por subcadena del comando.
function dobleRun(respuestas = {}) {
  const llamadas = [];
  const run = (cmd, args, opts = {}) => {
    llamadas.push({ cmd, args, opts, linea: [cmd, ...args].join(' ') });
    const entrada = Object.entries(respuestas).find(([k]) => [cmd, ...args].join(' ').includes(k));
    const r = entrada ? entrada[1] : {};
    return { code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  run.llamadas = llamadas;
  run.lineas = () => llamadas.map((l) => l.linea);
  return run;
}

// Doble de prompt: devuelve las respuestas en cola y guarda las preguntas hechas.
function doblePrompt(respuestas = []) {
  const cola = [...respuestas];
  const preguntas = [];
  const siguiente = () => cola.shift();
  return {
    preguntas,
    pendientes: () => cola.length,
    async ask(q) { preguntas.push(q); return siguiente() ?? ''; },
    async askSecret(q) { preguntas.push(q); return siguiente() ?? ''; },
    async confirm(q, def = true) { preguntas.push(q); const v = siguiente(); return v === undefined ? def : v; },
  };
}

// Doble de fetch: devuelve en orden los JSON que se le pasen y guarda las peticiones.
function dobleFetch(...cuerpos) {
  const peticiones = [];
  const cola = [...cuerpos];
  const f = async (url, opts) => {
    peticiones.push({ url, opts });
    const cuerpo = cola.shift() ?? {};
    return { ok: true, async json() { return cuerpo; } };
  };
  f.peticiones = peticiones;
  return f;
}

const silencio = () => {};

// --- stepToken ---

test('stepToken guarda el token devuelto por Aules en .env', async () => {
  const root = mkRoot();
  const fetch = dobleFetch({ token: 'abc123' });
  const prompt = doblePrompt(['izan', 'secreta']);
  const r = await stepToken({ cfg: mkCfg(root), fetch, prompt, log: silencio });
  assert.deepEqual({ ok: r.ok, cambiado: r.cambiado }, { ok: true, cambiado: true });
  assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'AULES_TOKEN=abc123\n');
  const peticion = fetch.peticiones[0];
  assert.equal(peticion.url, 'https://aules.test/fp/login/token.php');
  assert.equal(peticion.opts.method, 'POST');
  assert.match(peticion.opts.headers['content-type'], /x-www-form-urlencoded/);
  assert.equal(peticion.opts.body, 'username=izan&password=secreta&service=moodle_mobile_app');
});

test('stepToken no escribe la contraseña en ningún sitio', async () => {
  const root = mkRoot();
  const registro = [];
  await stepToken({
    cfg: mkCfg(root),
    fetch: dobleFetch({ token: 'abc123' }),
    prompt: doblePrompt(['izan', 'contra-secreta']),
    log: (t) => registro.push(String(t)),
  });
  assert.ok(!readFileSync(join(root, '.env'), 'utf8').includes('contra-secreta'));
  assert.ok(!registro.join('\n').includes('contra-secreta'));
});

test('stepToken repite si Aules no devuelve token y acepta el segundo intento', async () => {
  const root = mkRoot();
  const registro = [];
  const prompt = doblePrompt(['izan', 'mala', 'izan', 'buena']);
  const r = await stepToken({
    cfg: mkCfg(root),
    fetch: dobleFetch({ error: 'Usuario o contraseña incorrectos', errorcode: 'invalidlogin' }, { token: 'ok-2' }),
    prompt,
    log: (t) => registro.push(String(t)),
  });
  assert.equal(r.ok, true);
  assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'AULES_TOKEN=ok-2\n');
  assert.match(registro.join('\n'), /invalidlogin/);
  assert.match(registro.join('\n'), /incorrectos/);
});

test('stepToken se rinde tras tres intentos fallidos', async () => {
  const root = mkRoot();
  const fetch = dobleFetch({ error: 'no' }, { error: 'no' }, { error: 'no' });
  const prompt = doblePrompt(['a', 'b', 'a', 'b', 'a', 'b']);
  const r = await stepToken({ cfg: mkCfg(root), fetch, prompt, log: silencio });
  assert.deepEqual(r, { ok: false, reason: 'token' });
  assert.equal(fetch.peticiones.length, 3);
  assert.ok(!existsSync(join(root, '.env')));
});

test('stepToken con un token ya guardado pregunta y lo deja si se responde que no', async () => {
  const root = mkRoot({ env: 'AULES_TOKEN=viejo\n' });
  const fetch = dobleFetch({ token: 'nuevo' });
  const prompt = doblePrompt([false]);
  const r = await stepToken({ cfg: mkCfg(root), fetch, prompt, log: silencio });
  assert.deepEqual(r, { ok: true, cambiado: false });
  assert.equal(readFileSync(join(root, '.env'), 'utf8'), 'AULES_TOKEN=viejo\n');
  assert.equal(fetch.peticiones.length, 0);
  assert.match(prompt.preguntas[0], /¿Cambiarlo\?/);
});

test('stepToken conserva las demás claves del .env al cambiar el token', async () => {
  const root = mkRoot({ env: '# comentario\nOTRA=1\nAULES_TOKEN=viejo\nTERCERA="con espacios"\n' });
  const prompt = doblePrompt([true, 'izan', 'secreta']);
  const r = await stepToken({
    cfg: mkCfg(root),
    fetch: dobleFetch({ token: 'nuevo' }),
    prompt,
    log: silencio,
  });
  assert.equal(r.ok, true);
  const env = readFileSync(join(root, '.env'), 'utf8');
  assert.equal(env, 'OTRA=1\nAULES_TOKEN=nuevo\nTERCERA=con espacios\n');
});

// --- stepFirstSync ---

test('stepFirstSync devuelve ok si el sync termina con código 0', async () => {
  const root = mkRoot({ env: 'AULES_TOKEN=abc\n' });
  const run = dobleRun();
  const r = await stepFirstSync({ cfg: mkCfg(root), run, log: silencio });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(run.lineas(), ['/usr/bin/node scripts/sync-aules/sync.js']);
  assert.equal(run.llamadas[0].opts.cwd, root);
  assert.equal(run.llamadas[0].opts.env.AULES_TOKEN, 'abc');
});

test('stepFirstSync con código 3 ejecuta discover y devuelve reason cursos', async () => {
  const root = mkRoot({ env: 'AULES_TOKEN=abc\n' });
  const run = dobleRun({
    'sync.js discover': { code: 0, stdout: '  240348  SOS  Sistemas' },
    'sync.js': { code: 3 },
  });
  const registro = [];
  const r = await stepFirstSync({ cfg: mkCfg(root), run, log: (t) => registro.push(String(t)) });
  assert.deepEqual(r, { ok: false, reason: 'cursos' });
  assert.deepEqual(run.lineas(), [
    '/usr/bin/node scripts/sync-aules/sync.js',
    '/usr/bin/node scripts/sync-aules/sync.js discover',
  ]);
  const texto = registro.join('\n');
  assert.match(texto, /240348/);
  assert.match(texto, /data\/config\.json/);
  assert.match(texto, /npm run setup/);
});

test('stepFirstSync con otro código de error devuelve reason sync', async () => {
  const root = mkRoot({ env: 'AULES_TOKEN=abc\n' });
  const run = dobleRun({ 'sync.js': { code: 2 } });
  const r = await stepFirstSync({ cfg: mkCfg(root), run, log: silencio });
  assert.deepEqual(r, { ok: false, reason: 'sync' });
  assert.equal(run.llamadas.length, 1);
});

// --- stepCloudflare ---

const SIN_SESION = { code: 1, stderr: 'You are not authenticated' };
const CON_SESION = { code: 0, stdout: 'You are logged in with an OAuth Token, associated with the email izan@test.' };

function depsCloudflare(root, run, respuestas) {
  return {
    cfg: mkCfg(root),
    run,
    prompt: doblePrompt(respuestas),
    log: silencio,
    randomToken: () => 'f'.repeat(64),
  };
}

test('stepCloudflare llama a wrangler login si no hay sesión', async () => {
  const root = mkRoot();
  const run = dobleRun({ whoami: SIN_SESION });
  const r = await stepCloudflare(depsCloudflare(root, run, ['clave', 'clave']));
  assert.equal(r.ok, true);
  const lineas = run.lineas();
  assert.equal(lineas[0], 'npx -y wrangler@latest whoami');
  assert.equal(lineas[1], 'npx -y wrangler@latest login');
  assert.equal(run.llamadas[1].opts.inherit, true);
});

test('stepCloudflare no llama a login si ya hay sesión y crea el proyecto de Pages', async () => {
  const root = mkRoot();
  const run = dobleRun({ whoami: CON_SESION });
  await stepCloudflare(depsCloudflare(root, run, ['clave', 'clave']));
  const lineas = run.lineas();
  assert.ok(!lineas.some((l) => l.endsWith('wrangler@latest login')));
  assert.equal(lineas[1], 'npx -y wrangler@latest pages project create bedel-test --production-branch main');
  assert.equal(run.llamadas[1].opts.cwd, join(root, 'web'));
});

test('stepCloudflare ignora que el proyecto de Pages ya exista', async () => {
  const root = mkRoot();
  const run = dobleRun({
    whoami: CON_SESION,
    'pages project create': { code: 1, stderr: 'A project with this name already exists' },
  });
  const r = await stepCloudflare(depsCloudflare(root, run, ['clave', 'clave']));
  assert.equal(r.ok, true);
  assert.equal(run.lineas().filter((l) => l.includes('secret put')).length, 4);
});

test('stepCloudflare se detiene si pages project create falla por otra razón', async () => {
  const root = mkRoot();
  const run = dobleRun({ whoami: CON_SESION, 'pages project create': { code: 1, stderr: 'Authentication error' } });
  const r = await stepCloudflare(depsCloudflare(root, run, ['clave', 'clave']));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'pages');
  assert.ok(!run.lineas().some((l) => l.includes('secret put')));
});

test('stepCloudflare sube los cuatro secretos por stdin con cwd en web/', async () => {
  const root = mkRoot();
  const run = dobleRun({ whoami: CON_SESION });
  const r = await stepCloudflare(depsCloudflare(root, run, ['clave-web', 'clave-web']));
  assert.equal(r.ok, true);
  const secretos = run.llamadas.filter((l) => l.linea.includes('secret put'));
  assert.deepEqual(secretos.map((s) => s.linea), [
    'npx -y wrangler@latest pages secret put SITE_PASSWORD --project-name bedel-test',
    'npx -y wrangler@latest secret put SITE_PASSWORD --config wrangler.worker.toml',
    'npx -y wrangler@latest pages secret put SITE_TOKEN --project-name bedel-test',
    'npx -y wrangler@latest secret put SITE_TOKEN --config wrangler.worker.toml',
  ]);
  assert.deepEqual(secretos.map((s) => s.opts.input), ['clave-web', 'clave-web', 'f'.repeat(64), 'f'.repeat(64)]);
  for (const s of secretos) assert.equal(s.opts.cwd, join(root, 'web'));
});

test('stepCloudflare vuelve a pedir la contraseña si las dos no coinciden', async () => {
  const root = mkRoot();
  const run = dobleRun({ whoami: CON_SESION });
  const deps = depsCloudflare(root, run, ['una', 'otra', '', '', 'buena', 'buena']);
  const registro = [];
  deps.log = (t) => registro.push(String(t));
  const r = await stepCloudflare(deps);
  assert.equal(r.ok, true);
  const secretos = run.llamadas.filter((l) => l.linea.includes('secret put SITE_PASSWORD'));
  assert.deepEqual(secretos.map((s) => s.opts.input), ['buena', 'buena']);
  assert.match(registro.join('\n'), /no coinciden/);
  assert.match(registro.join('\n'), /vacía/);
});

test('stepCloudflare devuelve los secretos que no se pudieron subir', async () => {
  const root = mkRoot();
  const run = dobleRun({
    whoami: CON_SESION,
    'wrangler@latest secret put': { code: 1, stderr: "There doesn't seem to be a Worker called bedel" },
  });
  const r = await stepCloudflare(depsCloudflare(root, run, ['clave', 'clave']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.pendientes.map((p) => [p.destino, p.nombre]), [['worker', 'SITE_PASSWORD'], ['worker', 'SITE_TOKEN']]);
});

// --- stepDeploy ---

test('stepDeploy despliega e imprime las dos URLs con la nota del instituto', async () => {
  const root = mkRoot();
  const run = dobleRun();
  const registro = [];
  const r = await stepDeploy({
    cfg: mkCfg(root),
    run,
    deploy: () => ({ pages: 'ok', worker: 'ok', workerUrl: 'https://bedel-test.izan.workers.dev' }),
    log: (t) => registro.push(String(t)),
  });
  assert.equal(r.ok, true);
  assert.equal(r.pagesUrl, 'https://bedel-test.pages.dev');
  assert.equal(r.workerUrl, 'https://bedel-test.izan.workers.dev');
  const texto = registro.join('\n');
  assert.match(texto, /https:\/\/bedel-test\.pages\.dev/);
  assert.match(texto, /https:\/\/bedel-test\.izan\.workers\.dev/);
  assert.match(texto, /instituto/);
});

test('stepDeploy avisa si no sabe la URL de Workers', async () => {
  const root = mkRoot();
  const registro = [];
  const r = await stepDeploy({
    cfg: mkCfg(root),
    run: dobleRun(),
    deploy: () => ({ pages: 'ok', worker: 'ok' }),
    log: (t) => registro.push(String(t)),
  });
  assert.equal(r.ok, true);
  assert.equal(r.workerUrl, null);
  assert.match(registro.join('\n'), /salida de arriba/);
});

test('stepDeploy devuelve ok false si un destino falla', async () => {
  const root = mkRoot();
  const r = await stepDeploy({
    cfg: mkCfg(root),
    run: dobleRun(),
    deploy: () => ({ pages: 'deploy en Pages fallido', worker: 'ok' }),
    log: silencio,
  });
  assert.equal(r.ok, false);
});

// --- stepSchedule ---

test('stepSchedule instala la tarea si se responde que sí', async () => {
  const root = mkRoot();
  const run = dobleRun();
  const llamadas = [];
  const r = await stepSchedule({
    cfg: mkCfg(root),
    run,
    prompt: doblePrompt([true]),
    schedule: { install: (cfg, run2) => { llamadas.push([cfg.root, run2 === run]); return { installed: true, platform: 'darwin' }; } },
    log: silencio,
  });
  assert.deepEqual(r, { ok: true, programado: true });
  assert.deepEqual(llamadas, [[root, true]]);
});

test('stepSchedule no instala nada si se responde que no', async () => {
  const root = mkRoot();
  const prompt = doblePrompt([false]);
  const r = await stepSchedule({
    cfg: mkCfg(root),
    run: dobleRun(),
    prompt,
    schedule: { install: () => { throw new Error('no debería instalar'); } },
    log: silencio,
  });
  assert.deepEqual(r, { ok: true, programado: false });
  assert.match(prompt.preguntas[0], /cada 2 horas/);
});

// --- stepConfig ---

test('stepConfig escribe bedel.config.json con el nombre preguntado', async () => {
  const root = mkRoot();
  const prompt = doblePrompt(['mi-bedel']);
  const r = await stepConfig({ cfg: mkCfg(root), prompt, log: silencio });
  assert.equal(r.ok, true);
  assert.equal(r.pagesProject, 'mi-bedel');
  const json = JSON.parse(readFileSync(join(root, 'bedel.config.json'), 'utf8'));
  assert.equal(json.pagesProject, 'mi-bedel');
  assert.equal(json.syncIntervalMinutes, 120);
  assert.equal(json.nodeBin, process.execPath);
});

test('stepConfig usa bedel si no se escribe nada', async () => {
  const root = mkRoot();
  const r = await stepConfig({ cfg: mkCfg(root), prompt: doblePrompt(['  ']), log: silencio });
  assert.equal(r.pagesProject, 'bedel');
  assert.match(JSON.parse(readFileSync(join(root, 'bedel.config.json'), 'utf8')).pagesProject, /^bedel$/);
});

test('stepConfig no sobrescribe un bedel.config.json existente', async () => {
  const original = '{ "pagesProject": "ya-estaba" }';
  const root = mkRoot({ config: original });
  const prompt = doblePrompt(['otro']);
  const r = await stepConfig({ cfg: mkCfg(root, { pagesProject: 'ya-estaba' }), prompt, log: silencio });
  assert.deepEqual(r, { ok: true, creado: false, pagesProject: 'ya-estaba' });
  assert.equal(readFileSync(join(root, 'bedel.config.json'), 'utf8'), original);
  assert.equal(prompt.preguntas.length, 0);
});
