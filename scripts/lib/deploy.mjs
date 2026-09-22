// Construcción de la web y despliegue en los dos destinos de Cloudflare.
// Dos destinos con el mismo contenido: Pages (<proyecto>.pages.dev) y Workers (el subdominio workers.dev de tu cuenta).
// El segundo existe porque la red del instituto bloquea las IPs de *.pages.dev pero deja pasar *.workers.dev.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as runReal } from './run.mjs';

// Solo estas líneas de wrangler interesan en el log: el resto es telemetría y avisos de versión.
const UTIL = /Uploading|Deploying|Deployed|Success|https:\/\/|ERROR|Error/;

function imprimirFiltrado(salida) {
  const lineas = salida.split('\n').filter((l) => UTIL.test(l));
  if (lineas.length) process.stdout.write(`${lineas.join('\n')}\n`);
}

// wrangler imprime la URL del worker al final del despliegue: es la unica forma de saber
// el subdominio de la cuenta, que cambia en cada cuenta de Cloudflare.
export function extraerWorkerUrl(salida) {
  const m = String(salida).match(/https:\/\/[\w.-]+\.workers\.dev/);
  return m ? m[0] : null;
}

function copiarJson(origen, destino) {
  if (!existsSync(origen)) return;
  for (const f of readdirSync(origen)) {
    if (f.endsWith('.json')) cpSync(join(origen, f), join(destino, f));
  }
}

// Copia los datos al proyecto web y construye web/dist.
export function buildWeb(cfg, run = runReal) {
  const web = join(cfg.root, 'web');
  const publicData = join(web, 'public', 'data');
  rmSync(publicData, { recursive: true, force: true });
  mkdirSync(join(publicData, 'aules'), { recursive: true });
  copiarJson(join(cfg.root, 'data'), publicData);
  copiarJson(join(cfg.root, 'data', 'aules'), join(publicData, 'aules'));

  if (!existsSync(join(web, 'node_modules'))) {
    if (run('npm', ['ci'], { cwd: web }).code !== 0) throw new Error('npm ci en web/ falló');
  }
  if (run('npm', ['run', 'build'], { cwd: web }).code !== 0) throw new Error('npm run build en web/ falló');

  const dist = join(web, 'dist');
  mkdirSync(dist, { recursive: true });
  rmSync(join(dist, 'functions'), { recursive: true, force: true });
  if (existsSync(join(web, 'functions'))) cpSync(join(web, 'functions'), join(dist, 'functions'), { recursive: true });
  // Pages necesita dist/functions, pero el despliegue en Workers no debe subirlo como asset público.
  writeFileSync(join(dist, '.assetsignore'), 'functions\n');
}

export function deployPages(cfg, run = runReal) {
  const r = run('npx', ['-y', 'wrangler@latest', 'pages', 'deploy', 'dist', '--project-name', cfg.pagesProject, '--branch', 'main', '--commit-dirty=true'], { cwd: join(cfg.root, 'web'), quiet: true });
  imprimirFiltrado(r.stdout + r.stderr);
  if (r.code !== 0) throw new Error('deploy en Pages fallido');
  return r;
}

export function deployWorker(cfg, run = runReal) {
  const r = run('npx', ['-y', 'wrangler@latest', 'deploy', '--config', cfg.workerConfig], { cwd: join(cfg.root, 'web'), quiet: true });
  imprimirFiltrado(r.stdout + r.stderr);
  if (r.code !== 0) throw new Error('deploy en Workers fallido');
  return r;
}

// Un fallo en un destino no debe impedir el otro: esto corre sin interacción desde el sync.
export function deployAll(cfg, run = runReal) {
  buildWeb(cfg, run);
  const resultado = { workerUrl: null };
  for (const [clave, destino, fn] of [['pages', 'Cloudflare Pages', deployPages], ['worker', 'Cloudflare Workers', deployWorker]]) {
    console.log(`== ${destino} ==`);
    try {
      const r = fn(cfg, run);
      if (clave === 'worker') resultado.workerUrl = extraerWorkerUrl(`${r.stdout}${r.stderr}`);
      resultado[clave] = 'ok';
    } catch (e) {
      resultado[clave] = e.message;
      console.error(e.message);
    }
  }
  return resultado;
}

// Prepara los ficheros indicados, commitea si hay cambios, sincroniza con el remoto y despliega.
export function commitAndDeploy(cfg, run = runReal, paths = [], message = '') {
  const cwd = cfg.root;
  run('git', ['add', ...paths], { cwd });
  // git diff --cached --quiet devuelve 1 cuando hay cambios preparados y 0 cuando no hay nada que commitear.
  const hayCambios = run('git', ['diff', '--cached', '--quiet', '--', ...paths], { cwd, quiet: true }).code !== 0;
  if (hayCambios) run('git', ['commit', '-q', '-m', message], { cwd });
  run('git', ['pull', '--rebase', '--autostash'], { cwd });
  run('git', ['push'], { cwd });
  return { committed: hayCambios, ...deployAll(cfg, run) };
}
