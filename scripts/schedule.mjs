#!/usr/bin/env node
// Programa el ciclo de sincronización en la máquina actual.
// Uso: npm run schedule              instala la tarea
//      npm run schedule -- --quitar  la desinstala
//      npm run schedule -- --estado  muestra si está activa
import { loadConfig } from './lib/config.mjs';
import { run } from './lib/run.mjs';
import { install, status, uninstall } from './lib/schedule.mjs';

const cfg = loadConfig();
const args = process.argv.slice(2);

if (args.includes('--estado')) {
  const r = status(cfg, run);
  if (r.installed) console.log(`Tarea activa: ${r.salida}`);
  else console.log('La tarea no está programada. Ejecuta "npm run schedule" para instalarla.');
  process.exit(r.installed ? 0 : 1);
}

if (args.includes('--quitar')) {
  uninstall(cfg, run);
  console.log('Tarea de sincronización quitada.');
  process.exit(0);
}

const r = install(cfg, run);
if (r.installed) {
  const cada = `cada ${cfg.syncIntervalMinutes} minutos`;
  console.log(`Sincronización programada ${cada}. Log en ${cfg.logFile}.`);
  if (r.plist) console.log(`Agente: ${r.label} (${r.plist})`);
  if (r.tarea) console.log(`Tarea: ${r.tarea}`);
} else if (r.platform === 'darwin' || r.platform === 'win32') {
  console.error('No se pudo programar la tarea. Revisa la salida anterior.');
  process.exit(1);
}
