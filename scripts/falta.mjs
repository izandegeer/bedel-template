#!/usr/bin/env node
// Uso: node scripts/falta.mjs CODE [YYYY-MM-DD] [--justificada] [--sesiones N] [--nota "texto"] [--borrar] [--sin-deploy]
// BEDEL_ROOT permite apuntar a otra copia de data/ (útil para pruebas).
import { resolve } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { commitAndDeploy } from './lib/deploy.mjs';
import { addAbsence, readManual, readTimetable, removeAbsence, todayInMadrid, writeManual } from './lib/manual.mjs';

const root = process.env.BEDEL_ROOT ? resolve(process.env.BEDEL_ROOT) : ROOT;
const args = process.argv.slice(2);
const code = (args[0] ?? '').toUpperCase();
const tt = readTimetable(root);
if (!code || !tt.subjects[code]) {
  console.error(`Uso: falta CODE [fecha] [--justificada] [--sesiones N] [--nota "…"] [--borrar] [--sin-deploy]\nCódigos: ${Object.keys(tt.subjects).join(', ')}`);
  process.exit(2);
}

const date = args.find((a, i) => i > 0 && /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayInMadrid();
const justified = args.includes('--justificada');
const remove = args.includes('--borrar');
const si = args.indexOf('--sesiones');
const sessions = si >= 0 ? Number(args[si + 1]) : undefined;
const ni = args.indexOf('--nota');
const note = ni >= 0 ? args[ni + 1] : undefined;

try {
  const manual = readManual(root);
  if (remove) {
    const { manual: out, removed } = removeAbsence(manual, { code, date });
    console.log(`eliminadas ${removed} falta(s) de ${code} el ${date}`);
    writeManual(root, out);
  } else {
    const out = addAbsence(manual, tt, { code, date, sessions, justified, note });
    const entry = out.absences.find((a) => a.code === code && a.date === date);
    console.log(`falta registrada: ${code} ${date}, ${entry.sessions} sesión(es)${justified ? ', justificada' : ''}`);
    writeManual(root, out);
  }
  publicar(args);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// Sube el cambio al repo y despliega la web, salvo con --sin-deploy o en modo de prueba (BEDEL_ROOT).
function publicar(argumentos) {
  if (argumentos.includes('--sin-deploy') || process.env.BEDEL_ROOT) return;
  commitAndDeploy(loadConfig(), undefined, ['data/manual.json'], `faltas: ${argumentos.join(' ')}`);
}
