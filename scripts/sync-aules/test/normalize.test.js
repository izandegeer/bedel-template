// scripts/sync-aules/test/normalize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAssignments } from '../lib/normalize.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/assignments.json', import.meta.url)));
const config = { baseUrl: 'https://aules.edu.gva.es/fp', courses: { '8812': 'DWS' } };
const statuses = { 501: { submitted: true, graded: false }, 502: { submitted: false, graded: false } };

test('convierte cada assignment al formato del hub', () => {
  const out = normalizeAssignments(fixture, statuses, config);
  const first = out.find((a) => a.id === 'aules-501');
  assert.deepEqual(first, {
    id: 'aules-501',
    courseId: 8812,
    code: 'DWS',
    title: 'Práctica 1: Rutas en Laravel',
    due: '2025-10-15T23:59:00+02:00',
    url: 'https://aules.edu.gva.es/fp/mod/assign/view.php?id=90001',
    submitted: true,
    graded: false,
  });
});

test('duedate 0 se convierte en null', () => {
  const out = normalizeAssignments(fixture, statuses, config);
  assert.equal(out.find((a) => a.id === 'aules-502').due, null);
});

test('cursos sin mapeo salen con code null', () => {
  const out = normalizeAssignments(fixture, statuses, config);
  assert.equal(out.find((a) => a.id === 'aules-900').code, null);
});

test('la salida va ordenada por fecha y luego id, los sin fecha al final', () => {
  const out = normalizeAssignments(fixture, statuses, config);
  assert.deepEqual(out.map((a) => a.id), ['aules-501', 'aules-900', 'aules-502']);
});

test('sin estado conocido, submitted y graded son false', () => {
  const out = normalizeAssignments(fixture, {}, config);
  assert.equal(out[0].submitted, false);
});

import { normalizeCourses, normalizeEvents, normalizeAnnouncements, normalizeResources } from '../lib/normalize.js';

const events = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url)));
const discussions = JSON.parse(readFileSync(new URL('./fixtures/discussions.json', import.meta.url)));
const contents = JSON.parse(readFileSync(new URL('./fixtures/contents.json', import.meta.url)));

test('normalizeCourses mapea id, nombres y code', () => {
  const out = normalizeCourses([{ id: 8812, fullname: 'DWES 2DAW', shortname: 'DWES-26' }], config);
  assert.deepEqual(out, [{ id: 8812, code: 'DWS', fullname: 'DWES 2DAW', shortname: 'DWES-26',
    url: 'https://aules.edu.gva.es/fp/course/view.php?id=8812' }]);
});

test('normalizeEvents descarta eventos de cursos no mapeados cuando hay mapeo', () => {
  const raw = { events: [
    { id: 1, name: 'a', timestart: 1761260400, eventtype: 'course', course: { id: 8812 }, url: 'u' },
    { id: 2, name: 'b', timestart: 1761260400, eventtype: 'course', course: { id: 9999 }, url: 'u' },
    { id: 3, name: 'c', timestart: 1761260400, eventtype: 'user', url: 'u' },
  ] };
  assert.deepEqual(normalizeEvents(raw, config).map((e) => e.id), ['aules-ev-1', 'aules-ev-3']);
  assert.equal(normalizeEvents(raw, { baseUrl: config.baseUrl, courses: {} }).length, 3, 'sin mapeo no filtra');
});

test('normalizeEvents excluye los eventos de tipo due (ya están en assignments)', () => {
  const out = normalizeEvents(events, config);
  assert.deepEqual(out, [{
    id: 'aules-ev-7001', courseId: 8812, code: 'DWS', title: 'Examen T1',
    start: '2025-10-24T01:00:00+02:00', type: 'course',
    url: 'https://aules.edu.gva.es/fp/calendar/view.php?view=day&time=1761260400',
  }]);
});

test('normalizeAnnouncements convierte discusiones en avisos con texto plano', () => {
  const out = normalizeAnnouncements([{ courseId: 8812, forumId: 400, raw: discussions }], config);
  assert.deepEqual(out, [{
    id: 'aules-an-3001', courseId: 8812, code: 'DWS', title: 'Cambio de aula jueves',
    text: 'El jueves vamos al aula 05.', html: '<p>El jueves vamos al aula 05.</p>',
    author: 'Arturo Albero', date: '2025-09-16T10:40:00+02:00',
    url: 'https://aules.edu.gva.es/fp/mod/forum/discuss.php?d=3001',
  }]);
});

test('normalizeResources incluye resource, url, folder, page, assign y quiz, con su enlace final', () => {
  const out = normalizeResources([{ courseId: 8812, raw: contents }], config);
  assert.deepEqual(out.map((r) => [r.id, r.kind, r.href]), [
    ['aules-res-90001', 'assign', 'https://aules.edu.gva.es/fp/mod/assign/view.php?id=90001'],
    ['aules-res-90010', 'resource', 'https://aules.edu.gva.es/fp/webservice/pluginfile.php/1/mod_resource/content/1/tema1.pdf?forcedownload=1'],
    ['aules-res-90011', 'url', 'https://laravel.com/docs'],
  ]);
  assert.equal(out[0].section, 'Tema 1');
  assert.equal(out[0].code, 'DWS');
});

import { stripHtml, unixToIso } from '../lib/normalize.js';

test('unixToIso devuelve null para 0', () => {
  assert.equal(unixToIso(0), null);
});

test('unixToIso usa +01:00 en horario de invierno', () => {
  assert.equal(unixToIso(1736938800), '2025-01-15T12:00:00+01:00');
});

test('unixToIso usa +02:00 en horario de verano', () => {
  assert.equal(unixToIso(1752573600), '2025-07-15T12:00:00+02:00');
});

test('stripHtml decodifica &amp; en último lugar', () => {
  assert.equal(stripHtml('a &amp;lt;b&amp;gt; c'), 'a &lt;b&gt; c');
});

test('stripHtml no revienta con entidades numéricas fuera de rango', () => {
  assert.equal(stripHtml('x &#1234567; y &#x110000; z'), 'x &#1234567; y &#x110000; z');
});

test('stripHtml elimina bloques script y style completos', () => {
  assert.equal(stripHtml('<p>hola</p><script>var a = 1 < 2;</script>'), 'hola');
  assert.equal(stripHtml('<style type="text/css">p { color: red }</style><p>hola</p>'), 'hola');
});

test('stripHtml decodifica entidades numéricas decimales y hexadecimales', () => {
  assert.equal(stripHtml('caf&#233; &#x2026;'), 'café …');
});

test('stripHtml decodifica entidades tipográficas con nombre', () => {
  assert.equal(stripHtml('Nota&hellip; &rsquo;&lsquo; &ldquo;&rdquo;'), 'Nota… ’‘ “”');
});

test('stripHtml convierte cierres de bloque en saltos de línea', () => {
  assert.equal(stripHtml('<div>a</div><div>b</div>'), 'a\nb');
  assert.equal(stripHtml('<h2>Título</h2><p>texto</p>'), 'Título\ntexto');
  assert.equal(stripHtml('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'), 'ab\nc');
});

test('stripHtml convierte los elementos de lista en guiones', () => {
  assert.equal(stripHtml('<ul><li>uno</li><li>dos</li></ul>'), '- uno\n- dos');
});

test('normalizeAnnouncements no revienta si un aviso no tiene fecha y lo deja al final', () => {
  const raw = {
    discussions: [
      { discussion: 3001, name: 'Primero', message: '<p>a</p>', timemodified: 1758012000, userfullname: 'A' },
      { discussion: 3002, name: 'Sin fecha', message: '<p>b</p>', timemodified: 0, userfullname: 'B' },
      { discussion: 3003, name: 'Más reciente', message: '<p>c</p>', timemodified: 1758098400, userfullname: 'C' },
    ],
  };
  const out = normalizeAnnouncements([{ courseId: 8812, forumId: 400, raw }], config);
  assert.deepEqual(out.map((a) => a.id), ['aules-an-3003', 'aules-an-3001', 'aules-an-3002']);
  assert.equal(out.at(-1).date, null);
});

test('los normalizadores toleran una config sin courses', () => {
  const bare = { baseUrl: 'https://aules.edu.gva.es/fp' };
  assert.equal(normalizeAssignments(fixture, statuses, bare)[0].code, null);
  assert.equal(normalizeCourses([{ id: 8812, fullname: 'x', shortname: 'y' }], bare)[0].code, null);
  assert.equal(normalizeEvents(events, bare)[0].code, null);
});

test('normalizeEvents deja url en null si el evento no la trae', () => {
  const out = normalizeEvents({ events: [{ id: 7003, name: 'Sin url', timestart: 1761260400, eventtype: 'course', course: { id: 8812 } }] }, config);
  assert.equal(out[0].url, null);
});

test('el orden de la salida no depende del orden de entrada', () => {
  const reversed = { ...fixture, courses: [...fixture.courses].reverse() };
  assert.deepEqual(
    normalizeAssignments(reversed, statuses, config),
    normalizeAssignments(fixture, statuses, config),
  );
});

test('normalizeResources decodifica entidades HTML en los títulos', () => {
  const raw = [{ id: 1, name: 'T', modules: [{ id: 5, name: 'Volumes (24/9 &amp; 29/9)', modname: 'assign', url: 'u' }] }];
  assert.equal(normalizeResources([{ courseId: 8812, raw }], config)[0].title, 'Volumes (24/9 & 29/9)');
});
