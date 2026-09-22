#!/usr/bin/env node
// Ciclo completo de sincronización: Aules, commit, push y despliegue de la web.
// Uso: npm run sync            ciclo completo
//      npm run sync -- --solo-deploy   solo reconstruye y despliega la web
// Lo lanza también la tarea programada (launchd en Mac, schtasks en Windows).
import { appendFileSync, fstatSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { syncCycle } from './lib/sync-cycle.mjs';

const cfg = loadConfig();
const soloDeploy = process.argv.slice(2).includes('--solo-deploy');

const ficheroLog = join(cfg.root, cfg.logFile);
mkdirSync(dirname(ficheroLog), { recursive: true });

// La tarea programada ya redirige su salida al mismo fichero: si es el caso, no escribir dos veces.
function salidaEsElLog() {
  try {
    const salida = fstatSync(1);
    const log = statSync(ficheroLog);
    return salida.dev === log.dev && salida.ino === log.ino;
  } catch { return false; }
}
const duplicaria = salidaEsElLog();

function log(texto) {
  console.log(texto);
  if (duplicaria) return;
  try { appendFileSync(ficheroLog, `${texto}\n`); }
  catch { /* si el log no se puede escribir, el ciclo sigue */ }
}

const r = await syncCycle(cfg, { log, soloDeploy });
// Sin red y sin cambios son salidas normales: no deben pintar de rojo la tarea programada.
process.exit(['ok', 'sin-cambios', 'sin-red'].includes(r.status) ? 0 : 1);
