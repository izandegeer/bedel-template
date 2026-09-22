// Pasos del instalador "npm run setup". Cada paso recibe sus dependencias
// ({ cfg, run, fetch, prompt, fs, log }) para poder doblarlas en los tests, y devuelve
// { ok, ... } sin lanzar excepciones: el que encadena los pasos decide si sigue o para.
import { randomBytes } from 'node:crypto';
import * as fsReal from 'node:fs';
import { join } from 'node:path';
import { run as runReal } from './run.mjs';
import { deployAll } from './deploy.mjs';
import { install as installSchedule } from './schedule.mjs';
import { parseEnv } from './sync-cycle.mjs';

const BASE_URL_POR_DEFECTO = 'https://aules.edu.gva.es/fp';
const WRANGLER = ['-y', 'wrangler@latest'];
const INTENTOS = 3;

// La URL de Aules vive en data/config.json, igual que para el sync.
function baseUrl(cfg, fs) {
  const fichero = join(cfg.root, 'data', 'config.json');
  if (fs.existsSync(fichero)) {
    try {
      const json = JSON.parse(fs.readFileSync(fichero, 'utf8'));
      if (json.baseUrl) return String(json.baseUrl).replace(/\/+$/, '');
    } catch { /* un config roto ya lo avisa el sync */ }
  }
  return BASE_URL_POR_DEFECTO;
}

function leerEnv(cfg, fs) {
  const fichero = join(cfg.root, '.env');
  if (!fs.existsSync(fichero)) return {};
  return parseEnv(fs.readFileSync(fichero, 'utf8'));
}

// Reescribe el .env entero: conserva las demás claves y no toca nada más del disco.
function escribirEnv(cfg, fs, claves) {
  const texto = Object.entries(claves).map(([k, v]) => `${k}=${v}`).join('\n');
  fs.writeFileSync(join(cfg.root, '.env'), `${texto}\n`);
}

/**
 * Paso 1: token de Aules. Pide usuario y contraseña, los cambia por un token en
 * login/token.php y lo guarda en .env. La contraseña no se imprime ni se guarda nunca.
 */
export async function stepToken({ cfg, prompt, fetch = globalThis.fetch, fs = fsReal, log = console.log }) {
  const actuales = leerEnv(cfg, fs);
  if (actuales.AULES_TOKEN) {
    if (!(await prompt.confirm('Ya hay un token de Aules guardado. ¿Cambiarlo?', false))) {
      return { ok: true, cambiado: false };
    }
  }

  const url = `${baseUrl(cfg, fs)}/login/token.php`;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    const usuario = await prompt.ask('Usuario de Aules: ');
    const contrasena = await prompt.askSecret('Contraseña de Aules: ');
    const cuerpo = new URLSearchParams({ username: usuario, password: contrasena, service: 'moodle_mobile_app' });

    let json = {};
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: cuerpo.toString(),
      });
      json = await respuesta.json();
    } catch (e) {
      log(`No se pudo contactar con Aules: ${e.message}`);
    }

    if (json?.token) {
      escribirEnv(cfg, fs, { ...actuales, AULES_TOKEN: json.token });
      log('Token guardado en .env (ignorado por git).');
      return { ok: true, cambiado: true };
    }
    const motivo = json?.error ?? 'Aules no devolvió token';
    log(`${motivo}${json?.errorcode ? ` (${json.errorcode})` : ''}`);
    if (intento < INTENTOS) log(`Vuelve a intentarlo (${intento} de ${INTENTOS}).`);
  }
  log('Tres intentos fallidos. Comprueba el usuario y la contraseña de Aules.');
  return { ok: false, reason: 'token' };
}

/**
 * Paso 2: primera sincronización con Aules. Si el sync se queja de los cursos (código 3),
 * imprime la lista de cursos matriculados para que se copien a data/config.json.
 */
export async function stepFirstSync({ cfg, run = runReal, fs = fsReal, log = console.log }) {
  const token = leerEnv(cfg, fs).AULES_TOKEN;
  const r = run(cfg.nodeBin, ['scripts/sync-aules/sync.js'], { cwd: cfg.root, env: { AULES_TOKEN: token } });
  if (r.code === 0) return { ok: true };

  if (r.code === 3) {
    const d = run(cfg.nodeBin, ['scripts/sync-aules/sync.js', 'discover'], { cwd: cfg.root, env: { AULES_TOKEN: token }, quiet: true });
    log(d.stdout.trim());
    log('');
    log('Copia los ids de tus cursos a "courses" en data/config.json, con el código de tres letras');
    log('de cada asignatura como valor, y vuelve a ejecutar "npm run setup".');
    return { ok: false, reason: 'cursos' };
  }
  log('La sincronización con Aules falló. Revisa la salida de arriba.');
  return { ok: false, reason: 'sync' };
}

// Un secret put, en Pages o en el worker. Los dos leen el valor por stdin: así no queda en el historial.
function ponerSecreto({ cfg, run }, destino, nombre, valor) {
  const args = destino === 'pages'
    ? [...WRANGLER, 'pages', 'secret', 'put', nombre, '--project-name', cfg.pagesProject]
    : [...WRANGLER, 'secret', 'put', nombre, '--config', cfg.workerConfig];
  return run('npx', args, { cwd: join(cfg.root, 'web'), input: valor, quiet: true });
}

/**
 * Sube los secretos indicados a los dos destinos y devuelve los que fallaron.
 * El worker todavía puede no existir la primera vez: en ese caso se reintenta tras el deploy.
 */
export function ponerSecretos(deps, secretos) {
  const log = deps.log ?? console.log;
  const pendientes = [];
  for (const { destino, nombre, valor } of secretos) {
    const r = ponerSecreto(deps, destino, nombre, valor);
    if (r.code === 0) continue;
    log(`No se pudo guardar ${nombre} en ${destino === 'pages' ? 'Pages' : 'Workers'}: se reintentará.`);
    pendientes.push({ destino, nombre, valor });
  }
  return pendientes;
}

/**
 * Paso 3: Cloudflare. Sesión de wrangler, proyecto de Pages y los cuatro secretos
 * (SITE_PASSWORD y SITE_TOKEN, en Pages y en el worker).
 */
export async function stepCloudflare({
  cfg, run = runReal, prompt, log = console.log, randomToken = () => randomBytes(32).toString('hex'),
}) {
  const web = join(cfg.root, 'web');

  const quien = run('npx', [...WRANGLER, 'whoami'], { cwd: web, quiet: true });
  if (!quien.stdout.includes('You are logged in')) {
    log('Hace falta entrar en Cloudflare: se abrirá el navegador.');
    // Interactivo: wrangler imprime la URL y espera, así que habla directamente con el terminal.
    if (run('npx', [...WRANGLER, 'login'], { cwd: web, inherit: true }).code !== 0) {
      log('No se pudo entrar en Cloudflare.');
      return { ok: false, reason: 'login' };
    }
  }

  const crear = run('npx', [...WRANGLER, 'pages', 'project', 'create', cfg.pagesProject, '--production-branch', 'main'], { cwd: web, quiet: true });
  if (crear.code !== 0) {
    const salida = `${crear.stdout}${crear.stderr}`;
    if (/already exists/i.test(salida)) {
      log(`El proyecto de Pages "${cfg.pagesProject}" ya existía.`);
    } else {
      log(salida.trim());
      log(`No se pudo crear el proyecto de Pages "${cfg.pagesProject}".`);
      return { ok: false, reason: 'pages' };
    }
  } else {
    log(`Proyecto de Pages "${cfg.pagesProject}" creado.`);
  }

  let contrasena = '';
  for (let intento = 1; intento <= INTENTOS && !contrasena; intento++) {
    const una = await prompt.askSecret('Contraseña para entrar en la web: ');
    const otra = await prompt.askSecret('Repite la contraseña: ');
    if (!una) log('La contraseña no puede estar vacía.');
    else if (una !== otra) log('Las contraseñas no coinciden.');
    else contrasena = una;
  }
  if (!contrasena) return { ok: false, reason: 'contrasena' };

  const siteToken = randomToken();
  const pendientes = ponerSecretos({ cfg, run, log }, [
    { destino: 'pages', nombre: 'SITE_PASSWORD', valor: contrasena },
    { destino: 'worker', nombre: 'SITE_PASSWORD', valor: contrasena },
    { destino: 'pages', nombre: 'SITE_TOKEN', valor: siteToken },
    { destino: 'worker', nombre: 'SITE_TOKEN', valor: siteToken },
  ]);
  return { ok: true, pendientes };
}

/** Paso 4: construir y desplegar en los dos destinos, e imprimir las URLs. */
export async function stepDeploy({ cfg, run = runReal, deploy = deployAll, log = console.log }) {
  const r = deploy(cfg, run);
  const pagesUrl = `https://${cfg.pagesProject}.pages.dev`;
  const workerUrl = r.workerUrl ?? null;

  log('');
  log(`Pages:   ${pagesUrl}`);
  log(`Workers: ${workerUrl ?? '(la URL de Workers aparece en la salida de arriba)'}`);
  log('En la red del instituto usa la de Workers: las IPs de pages.dev están bloqueadas.');

  const ok = r.pages === 'ok' && r.worker === 'ok';
  if (!ok) log('Algún destino falló. Cuando lo arregles: npm run sync -- --solo-deploy');
  return { ok, pagesUrl, workerUrl };
}

/** Paso 5: tarea programada que sincroniza cada dos horas. */
export async function stepSchedule({ cfg, run = runReal, prompt, schedule = { install: installSchedule }, log = console.log }) {
  if (!(await prompt.confirm('¿Programar la sincronización automática cada 2 horas?'))) {
    log('Sin tarea programada. Puedes hacerlo luego con "npm run schedule".');
    return { ok: true, programado: false };
  }
  const r = schedule.install(cfg, run);
  if (r.installed) log(`Sincronización programada cada ${cfg.syncIntervalMinutes} minutos. Log en ${cfg.logFile}.`);
  else log('No se pudo programar la tarea. Inténtalo con "npm run schedule".');
  return { ok: true, programado: r.installed };
}

/** Paso 0: bedel.config.json, lo propio de esta máquina. Si ya existe no se toca. */
export async function stepConfig({ cfg, prompt, fs = fsReal, log = console.log }) {
  const fichero = join(cfg.root, 'bedel.config.json');
  if (fs.existsSync(fichero)) return { ok: true, creado: false, pagesProject: cfg.pagesProject };

  const respuesta = await prompt.ask('Nombre del proyecto en Cloudflare [bedel]: ');
  const pagesProject = respuesta.trim() || 'bedel';
  const contenido = { pagesProject, syncIntervalMinutes: 120, nodeBin: process.execPath };
  fs.writeFileSync(fichero, `${JSON.stringify(contenido, null, 2)}\n`);
  log(`bedel.config.json creado con pagesProject "${pagesProject}".`);
  return { ok: true, creado: true, pagesProject };
}
