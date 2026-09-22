// scripts/sync-aules/lib/write.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

/** Escribe solo si el contenido difiere. Devuelve true si escribió. */
export function writeJson(path, value) {
  const next = stableStringify(value);
  if (existsSync(path) && readFileSync(path, 'utf8') === next) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}
