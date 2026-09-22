// Configuración de la máquina: lo que cambia entre una copia del repo y otra.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const DEFAULTS = {
  pagesProject: 'bedel',                // proyecto de Cloudflare Pages
  workerConfig: 'wrangler.worker.toml', // relativo a web/
  syncIntervalMinutes: 120,
  logFile: 'logs/sync.log',             // relativo a la raíz del repo, ignorado por git
  nodeBin: process.execPath,            // ruta de node para la tarea programada
};

export function loadConfig(root = ROOT) {
  const file = resolve(root, 'bedel.config.json');
  let fromFile = {};
  if (existsSync(file)) {
    try { fromFile = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`bedel.config.json no es JSON válido: ${e.message}`); }
  }
  return { ...DEFAULTS, ...fromFile, root, file };
}
