#!/usr/bin/env node
// Uso: node scripts/hecho.mjs CODE "texto" [YYYY-MM-DD] [--sin-deploy]
// Sin argumentos imprime el resumen de la semana y los días sin tocar cada asignatura.
// BEDEL_ROOT permite apuntar a otra copia de data/ (útil para pruebas).
import { resolve } from 'node:path';
import { ROOT, loadConfig } from './lib/config.mjs';
import { commitAndDeploy } from './lib/deploy.mjs';
import { addLog, readManual, readTimetable, todayInMadrid, weekSummary, writeManual } from './lib/manual.mjs';

const root = process.env.BEDEL_ROOT ? resolve(process.env.BEDEL_ROOT) : ROOT;
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const tt = readTimetable(root);

function uso(motivo) {
  console.error(`${motivo}\nUso: hecho CODE "texto" [YYYY-MM-DD] [--sin-deploy]\n      hecho                                  # resumen de la semana\nCódigos: ${Object.keys(tt.subjects).join(', ')}`);
  process.exit(2);
}

// dd/mm a partir de una fecha ISO
function corta(date) {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

// "hoy", "hace 1 día", "hace 3 días" o "nunca"
function desdeCuando(since) {
  if (since === null) return 'nunca';
  if (since === 0) return 'hoy';
  return `hace ${since} ${since === 1 ? 'día' : 'días'}`;
}

function resumen() {
  const { byCode, sinceByCode } = weekSummary(readManual(root), tt, { today: todayInMadrid() });
  const codigos = Object.keys(tt.subjects).filter((c) => byCode[c]?.length);
  if (!codigos.length) {
    console.log('esta semana: nada registrado todavía.');
  } else {
    console.log('esta semana');
    for (const code of codigos) {
      console.log(code);
      for (const { date, text } of byCode[code]) console.log(`  ${corta(date)}  ${text}`);
    }
  }
  console.log('');
  // De la más abandonada a la más reciente: primero las que nunca se han tocado.
  const orden = Object.keys(sinceByCode).sort((a, b) => {
    const sa = sinceByCode[a] ?? Infinity;
    const sb = sinceByCode[b] ?? Infinity;
    return sb - sa || a.localeCompare(b);
  });
  for (const code of orden) console.log(`${code}  ${desdeCuando(sinceByCode[code])}`);
}

if (!positional.length) {
  try {
    resumen();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
} else {
  const [rawCode, text, date] = positional;
  const code = rawCode.toUpperCase();
  if (!tt.subjects[code]) uso(`Código desconocido: ${rawCode}.`);
  if (!text) uso('Falta el texto de lo que has hecho.');
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) uso(`Fecha no válida: ${date}. Formato YYYY-MM-DD.`);

  try {
    const out = addLog(readManual(root), tt, { code, date, text });
    writeManual(root, out);
    const fecha = date ?? todayInMadrid();
    const texto = text.trim();
    console.log(`hecho: ${code} ${fecha}, ${texto}`);
    publicar(`log: ${code} ${texto}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

// Sube el cambio al repo y despliega la web, salvo con --sin-deploy o en modo de prueba (BEDEL_ROOT).
function publicar(mensaje) {
  if (args.includes('--sin-deploy') || process.env.BEDEL_ROOT) return;
  commitAndDeploy(loadConfig(), undefined, ['data/manual.json'], mensaje);
}
