import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, isGraded } from '../lib/fetch-all.js';

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    call: async (fn, args) => {
      calls.push({ fn, args });
      const r = responses[fn];
      return typeof r === 'function' ? r(args) : r;
    },
  };
}

test('fetchAll recorre site info, cursos, assignments, estados, eventos, foros y contenidos', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 1, fullname: 'A', shortname: 'a' }],
    mod_assign_get_assignments: { courses: [{ id: 1, assignments: [{ id: 501, cmid: 9, course: 1, name: 'P1', duedate: 0 }] }] },
    mod_assign_get_submission_status: { lastattempt: { submission: { status: 'submitted' } }, feedback: { grade: { grade: '8.00' } } },
    core_calendar_get_action_events_by_timesort: { events: [] },
    mod_forum_get_forums_by_courses: [{ id: 400, course: 1, type: 'news' }, { id: 401, course: 1, type: 'general' }],
    mod_forum_get_forum_discussions: { discussions: [] },
    core_course_get_contents: [],
  });

  const result = await fetchAll(client, { now: 1758012000 });

  assert.equal(result.userid, 7);
  assert.deepEqual(result.courses.map((c) => c.id), [1]);
  assert.deepEqual(result.statuses, { 501: { submitted: true, graded: true } });
  assert.deepEqual(result.forums.map((f) => f.forumId), [400], 'solo foros de tipo news');
  assert.deepEqual(result.contents.map((c) => c.courseId), [1]);

  const fns = client.calls.map((c) => c.fn);
  assert.equal(fns[0], 'core_webservice_get_site_info');
  assert.ok(fns.includes('core_calendar_get_action_events_by_timesort'));
  const ev = client.calls.find((c) => c.fn === 'core_calendar_get_action_events_by_timesort');
  assert.equal(ev.args.timesortfrom, 1758012000 - 7 * 86400, 'eventos desde hace una semana');
  assert.equal(ev.args.timesortto, 1758012000 + 60 * 86400, 'hasta dentro de 60 días');
});

test('un estado que falla no tumba la sincronización: se registra como no entregado', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 1 }],
    mod_assign_get_assignments: { courses: [{ id: 1, assignments: [{ id: 501, cmid: 9, course: 1, name: 'P1', duedate: 0 }] }] },
    mod_assign_get_submission_status: () => { throw new Error('nopermission'); },
    core_calendar_get_action_events_by_timesort: { events: [] },
    mod_forum_get_forums_by_courses: [],
    core_course_get_contents: [],
  });
  const warnings = [];
  const result = await fetchAll(client, { now: 0, warn: (m) => warnings.push(m) });
  assert.deepEqual(result.statuses, { 501: { submitted: false, graded: false } });
  assert.equal(warnings.length, 1);
});

test('courseIds filtra los cursos y las llamadas posteriores', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 1, fullname: 'A' }, { id: 2, fullname: 'B' }],
    mod_assign_get_assignments: { courses: [] },
    core_calendar_get_action_events_by_timesort: { events: [] },
    mod_forum_get_forums_by_courses: [],
    core_course_get_contents: [],
  });

  const result = await fetchAll(client, { now: 0, courseIds: [1] });

  assert.equal(result.courses.length, 1);
  assert.deepEqual(result.courses.map((c) => c.id), [1]);
  assert.deepEqual(result.contents.map((c) => c.courseId), [1]);
  const contentCalls = client.calls.filter((c) => c.fn === 'core_course_get_contents');
  assert.deepEqual(contentCalls.map((c) => c.args.courseid), [1]);
  const assignCall = client.calls.find((c) => c.fn === 'mod_assign_get_assignments');
  assert.deepEqual(assignCall.args.courseids, [1]);
});

test('sin cursos no se piden assignments ni foros', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [],
    core_calendar_get_action_events_by_timesort: { events: [] },
  });

  const result = await fetchAll(client, { now: 0 });

  const fns = client.calls.map((c) => c.fn);
  assert.ok(!fns.includes('mod_assign_get_assignments'));
  assert.ok(!fns.includes('mod_forum_get_forums_by_courses'));
  assert.deepEqual(result.assignments, { courses: [] });
  assert.deepEqual(result.contents, []);
});

test('los warnings de Moodle se reportan por warn', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 1 }],
    mod_assign_get_assignments: {
      courses: [],
      warnings: [{ warningcode: 'nopermission', message: 'Sin permiso en el curso 1' }],
    },
    core_calendar_get_action_events_by_timesort: { events: [] },
    mod_forum_get_forums_by_courses: [],
    core_course_get_contents: [],
  });
  const warnings = [];
  await fetchAll(client, { now: 0, warn: (m) => warnings.push(m) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Moodle warning en mod_assign_get_assignments: nopermission Sin permiso en el curso 1/);
});

test('una entrega de grupo cuenta como entregada aunque submission.status sea new', async () => {
  const client = fakeClient({
    core_webservice_get_site_info: { userid: 7 },
    core_enrol_get_users_courses: [{ id: 1 }],
    mod_assign_get_assignments: { courses: [{ id: 1, assignments: [{ id: 501 }] }] },
    mod_assign_get_submission_status: {
      lastattempt: {
        submission: { status: 'new' },
        teamsubmission: { status: 'submitted' },
      },
    },
    core_calendar_get_action_events_by_timesort: { events: [] },
    mod_forum_get_forums_by_courses: [],
    core_course_get_contents: [],
  });

  const result = await fetchAll(client, { now: 0 });
  assert.deepEqual(result.statuses, { 501: { submitted: true, graded: false } });
});

test('isGraded distingue la nota -1 (sin calificar) de un 0 real', () => {
  assert.equal(isGraded('-1.00000'), false);
  assert.equal(isGraded('0.00'), true);
  assert.equal(isGraded('8.00'), true);
  assert.equal(isGraded(undefined), false);
  assert.equal(isGraded(null), false);
  assert.equal(isGraded(''), false);
});
