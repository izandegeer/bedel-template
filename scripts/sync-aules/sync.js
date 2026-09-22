#!/usr/bin/env node
// scripts/sync-aules/sync.js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './lib/moodle.js';
import { fetchAll } from './lib/fetch-all.js';
import {
  normalizeAssignments, normalizeCourses, normalizeEvents,
  normalizeAnnouncements, normalizeResources,
} from './lib/normalize.js';
import { writeJson } from './lib/write.js';
import { detectChanges, mergeChanges } from './lib/changes.js';
import { existsSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA = resolve(ROOT, 'data');
const configPath = resolve(DATA, 'config.json');

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const token = process.env.AULES_TOKEN;
if (!token) {
  console.error('Falta la variable de entorno AULES_TOKEN');
  process.exit(2);
}

const mappedIds = Object.keys(config.courses ?? {}).map(Number);
const client = createClient({ baseUrl: config.baseUrl, token });
const command = process.argv[2] ?? 'sync';

if (command === 'discover') {
  const site = await client.call('core_webservice_get_site_info');
  const courses = await client.call('core_enrol_get_users_courses', { userid: site.userid });
  console.log(`Usuario: ${site.fullname} (${site.userid})\n`);
  console.log('Cursos matriculados. Copia los ids a data/config.json → "courses":\n');
  for (const c of courses.sort((a, b) => a.id - b.id)) {
    const mapped = config.courses?.[String(c.id)] ?? '(sin mapear)';
    const finalizado = c.enddate && c.enddate * 1000 < Date.now() ? '*' : ' ';
    console.log(`${finalizado} ${String(c.id).padEnd(7)} ${String(mapped).padEnd(14)} ${c.fullname}`);
  }
  console.log('\n* = curso finalizado');
} else {
  if (mappedIds.length === 0) {
    console.error('No hay cursos mapeados en data/config.json. Ejecuta \'npm run discover\' y rellena "courses".');
    process.exit(3);
  }

  const raw = await fetchAll(client, { courseIds: mappedIds });

  if (raw.courses.length === 0 || raw.courses.length * 2 < mappedIds.length) {
    console.error(`Aules devolvió ${raw.courses.length} de ${mappedIds.length} cursos mapeados: no se escribe nada (¿token caducado o ids de config incorrectos?)`);
    process.exit(3);
  }

  const outputs = {
    'courses.json': normalizeCourses(raw.courses, config),
    'assignments.json': normalizeAssignments(raw.assignments, raw.statuses, config),
    'events.json': normalizeEvents(raw.events, config),
    'announcements.json': normalizeAnnouncements(raw.forums, config),
    'resources.json': normalizeResources(raw.contents, config),
  };

  // Novedades: comparar con la sincronización anterior antes de sobrescribir.
  const assignmentsPath = resolve(DATA, 'aules', 'assignments.json');
  const changesPath = resolve(DATA, 'aules', 'changes.json');
  const prevAssignments = existsSync(assignmentsPath) ? JSON.parse(readFileSync(assignmentsPath, 'utf8')) : null;
  const prevChanges = existsSync(changesPath) ? JSON.parse(readFileSync(changesPath, 'utf8')) : [];
  const nowIso = new Date().toISOString();
  const fresh = detectChanges(prevAssignments, outputs['assignments.json'], nowIso);
  outputs['changes.json'] = mergeChanges(prevChanges, fresh, nowIso);
  if (fresh.length) console.log(`novedades: ${fresh.length} (${fresh.map((c) => `${c.type} ${c.id}`).join(', ')})`);

  let changed = 0;
  for (const [name, value] of Object.entries(outputs)) {
    if (writeJson(resolve(DATA, 'aules', name), value)) {
      changed++;
      console.log(`actualizado data/aules/${name} (${value.length} elementos)`);
    }
  }

  writeJson(resolve(DATA, 'aules', 'meta.json'), {
    syncedAt: new Date().toISOString(),
    userid: raw.userid,
    counts: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k.replace('.json', ''), v.length])),
  });

  console.log(changed ? `${changed} fichero(s) con cambios` : 'sin cambios');
}
