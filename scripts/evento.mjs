#!/usr/bin/env node
// Uso: node scripts/evento.mjs CODE|- "Texto" YYYY-MM-DD [--tipo examen] [--sin-deploy]
// Usa "-" como código para los eventos que no son de ninguna asignatura, como los festivos.
// Por defecto el tipo es "examen" si hay código y "otro" si no.
// BEDEL_ROOT permite apuntar a otra copia de data/ (útil para pruebas).
import { resolve } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { commitAndDeploy } from './lib/deploy.mjs';
import { EVENT_TYPES, addEvent, readManual, readTimetable, writeManual } from './lib/manual.mjs';

const root = process.env.BEDEL_ROOT ? resolve(process.env.BEDEL_ROOT) : ROOT;
const args = process.argv.slice(2);
const flags = [];
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tipo') { flags.push(args[++i]); continue; }
  positional.push(args[i]);
}
const [rawCode, text, date] = positional;
const tt = readTimetable(root);

function uso(motivo) {
  console.error(`${motivo}\nUso: evento CODE|- "Texto" YYYY-MM-DD [--tipo ${EVENT_TYPES.join('|')}] [--sin-deploy]\nCódigos: ${Object.keys(tt.subjects).join(', ')}, o - para un evento sin asignatura`);
  process.exit(2);
}

if (!rawCode || !text || !date) uso('Faltan argumentos.');
const code = rawCode === '-' ? undefined : rawCode.toUpperCase();
if (code && !tt.subjects[code]) uso(`Código desconocido: ${rawCode}.`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) uso(`Fecha no válida: ${date}. Formato YYYY-MM-DD.`);
const type = flags.at(-1) ?? (code ? 'examen' : 'otro');
if (!EVENT_TYPES.includes(type)) uso(`Tipo de evento no válido: ${type}.`);

try {
  const out = addEvent(readManual(root), { date, type, text, code });
  writeManual(root, out);
  console.log(`evento registrado: ${type} ${date}${code ? ` ${code}` : ''}, ${text}`);
  publicar(args);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// Sube el cambio al repo y despliega la web, salvo con --sin-deploy o en modo de prueba (BEDEL_ROOT).
function publicar(argumentos) {
  if (argumentos.includes('--sin-deploy') || process.env.BEDEL_ROOT) return;
  commitAndDeploy(loadConfig(), undefined, ['data/manual.json'], `eventos: ${argumentos.join(' ')}`);
}
