// Ciclo completo de sincronización: Aules, commit, push y despliegue de la web.
// Sustituye a scripts/sync-local.sh paso a paso. Lo lanza la tarea programada y también la app Mac.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as runReal } from './run.mjs';
import { deployAll } from './deploy.mjs';

const BASE_URL_POR_DEFECTO = 'https://aules.edu.gva.es/fp';
const ESPERA_ENTRE_PUSH = 10000;

// Parser propio de .env: KEY=VALUE, una por línea. Ignora comentarios y líneas vacías,
// admite el prefijo "export" y quita un par de comillas simples o dobles alrededor del valor.
export function parseEnv(texto) {
  const salida = {};
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const corte = l.indexOf('=');
    if (corte <= 0) continue;
    const clave = l.slice(0, corte).trim().replace(/^export\s+/, '');
    let valor = l.slice(corte + 1).trim();
    const comilla = valor[0];
    if ((comilla === '"' || comilla === "'") && valor.length > 1 && valor.endsWith(comilla)) {
      valor = valor.slice(1, -1);
    }
    if (clave) salida[clave] = valor;
  }
  return salida;
}

// Lee el .env de la raíz del repo. Si no existe, devuelve un objeto vacío.
export function leerEnv(root) {
  const fichero = join(root, '.env');
  if (!existsSync(fichero)) return {};
  return parseEnv(readFileSync(fichero, 'utf8'));
}

// La URL de Aules vive en data/config.json, igual que para el sync.
function baseUrl(root) {
  const fichero = join(root, 'data', 'config.json');
  if (existsSync(fichero)) {
    try {
      const json = JSON.parse(readFileSync(fichero, 'utf8'));
      if (json.baseUrl) return String(json.baseUrl).replace(/\/+$/, '');
    } catch { /* un config roto ya lo avisa el sync, aquí basta con el valor por defecto */ }
  }
  return BASE_URL_POR_DEFECTO;
}

function dos(n) { return String(n).padStart(2, '0'); }

// "2026-09-22 08:30:01", hora local, como el date del script antiguo.
function fechaLocal(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// "2026-09-22 06:30 UTC", que es lo que va en el mensaje del commit.
function fechaUtc(d) {
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * Replica el ciclo de sync-local.sh. Devuelve { status, ... } y nunca lanza:
 * status es 'ok', 'sin-token', 'sin-red', 'pull-fallido', 'sync-fallido', 'sin-cambios' o 'push-fallido'.
 * Todas las dependencias se inyectan para poder doblarlas en los tests.
 */
export async function syncCycle(cfg, opciones = {}) {
  const {
    run = runReal,
    fetch: pedir = globalThis.fetch,
    log = console.log,
    env = process.env,
    deploy = deployAll,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => new Date(),
    soloDeploy = false,
  } = opciones;
  const cwd = cfg.root;

  log(`== ${fechaLocal(now())} inicio`);

  // Desplegar sin tocar Aules ni git: para rehacer la web cuando el deploy anterior falló.
  if (soloDeploy) return desplegar(cfg, run, deploy, log);

  const token = leerEnv(cwd).AULES_TOKEN || env.AULES_TOKEN;
  if (!token) {
    log('Falta .env con AULES_TOKEN');
    return { status: 'sin-token' };
  }

  // Comprobación rápida de red: si no hay conexión, salir sin ruido y sin tocar git.
  try {
    await pedir(`${baseUrl(cwd)}/`, { signal: AbortSignal.timeout(10000) });
  } catch {
    log('Aules no accesible, se omite');
    return { status: 'sin-red' };
  }

  if (run('git', ['pull', '--rebase', '--autostash', '-q', 'origin', 'main'], { cwd }).code !== 0) {
    run('git', ['rebase', '--abort'], { cwd, quiet: true });
    log('pull fallido');
    return { status: 'pull-fallido' };
  }

  if (run(cfg.nodeBin, ['scripts/sync-aules/sync.js'], { cwd, env: { ...env, AULES_TOKEN: token } }).code !== 0) {
    log('sync con Aules fallido');
    return { status: 'sync-fallido' };
  }

  // La app Bedel vigila data/ y publica ella misma en el App Group para el menú y los widgets.

  run('git', ['add', 'data/aules'], { cwd });
  // git diff --cached --quiet devuelve 1 cuando hay algo preparado y 0 cuando no hay nada que commitear.
  if (run('git', ['diff', '--cached', '--quiet'], { cwd, quiet: true }).code === 0) {
    log('Sin cambios');
    return { status: 'sin-cambios' };
  }
  const soloMeta = run('git', ['diff', '--cached', '--quiet', '--', ':!data/aules/meta.json'], { cwd, quiet: true }).code === 0;
  const message = `sync: ${soloMeta ? 'sin cambios de datos' : 'aules'} ${fechaUtc(now())}`;
  run('git', ['commit', '-q', '-m', message], { cwd });

  for (let intento = 1; intento <= 3; intento++) {
    const pull = run('git', ['pull', '--rebase', '--autostash', '-q', 'origin', 'main'], { cwd });
    if (pull.code === 0 && run('git', ['push', '-q'], { cwd }).code === 0) {
      log(`push ok: ${message}`);
      return { ...desplegar(cfg, run, deploy, log), message };
    }
    run('git', ['rebase', '--abort'], { cwd, quiet: true });
    log(`push fallido (intento ${intento})`);
    if (intento < 3) await sleep(ESPERA_ENTRE_PUSH);
  }
  log('No se pudo hacer push');
  return { status: 'push-fallido' };
}

// Un fallo al desplegar no invalida el sync: los datos ya están en el repo.
function desplegar(cfg, run, deploy, log) {
  let pages = 'no intentado';
  let worker = 'no intentado';
  try {
    const r = deploy(cfg, run);
    pages = r.pages;
    worker = r.worker;
  } catch (e) {
    pages = e.message;
    worker = e.message;
  }
  if (pages !== 'ok' || worker !== 'ok') log('deploy web fallido (no bloquea)');
  return { status: 'ok', pages, worker };
}
