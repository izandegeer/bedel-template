const WEEK = 7 * 86400;
const HORIZONTE = 60 * 86400;
// mod_forum_get_forum_discussions: 1 = ordenar por último mensaje, descendente.
const SORT_LASTPOST_DESC = 1;

/**
 * ¿Esta nota cuenta como calificada?
 * Moodle devuelve '-1.00000' cuando aún no hay nota, y cadena vacía/null cuando
 * no hay feedback. Un 0 real sí es una calificación.
 * @param {string|number|null|undefined} grade
 */
export function isGraded(grade) {
  if (grade === undefined || grade === null || grade === '') return false;
  const n = Number(grade);
  return Number.isFinite(n) && n >= 0;
}

function reportWarnings(resp, fn, warn) {
  if (!resp || !Array.isArray(resp.warnings)) return;
  // Moodle repite el mismo aviso por cada módulo afectado; se agrupa para no llenar el log.
  const counts = new Map();
  for (const w of resp.warnings) {
    const key = `Moodle warning en ${fn}: ${w.warningcode ?? ''} ${w.message ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) warn(n > 1 ? `${key} (x${n})` : key);
}

/**
 * Ejecuta todas las llamadas a Moodle y devuelve los datos crudos agrupados.
 * @param {{call:(fn:string,args?:object)=>Promise<any>}} client
 * @param {{now?:number, warn?:(msg:string)=>void, courseIds?:number[]}} opts
 */
export async function fetchAll(client, {
  now = Math.floor(Date.now() / 1000),
  warn = console.warn,
  courseIds: soloCursos,
} = {}) {
  const site = await client.call('core_webservice_get_site_info');
  const userid = site.userid;

  let courses = await client.call('core_enrol_get_users_courses', { userid });
  if (Array.isArray(soloCursos) && soloCursos.length) {
    courses = courses.filter((c) => soloCursos.includes(c.id));
  }
  const courseIds = courses.map((c) => c.id);

  const assignments = courseIds.length
    ? await client.call('mod_assign_get_assignments', { courseids: courseIds })
    : { courses: [] };
  reportWarnings(assignments, 'mod_assign_get_assignments', warn);

  const statuses = {};
  for (const course of assignments.courses ?? []) {
    for (const a of course.assignments ?? []) {
      try {
        const s = await client.call('mod_assign_get_submission_status', { assignid: a.id });
        // En entregas de grupo Moodle deja `submission.status` en 'new' y marca
        // la entrega real en `teamsubmission`.
        const submitted = s.lastattempt?.submission?.status === 'submitted'
          || s.lastattempt?.teamsubmission?.status === 'submitted';
        statuses[a.id] = {
          submitted,
          graded: isGraded(s.feedback?.grade?.grade),
        };
      } catch (err) {
        warn(`estado de assignment ${a.id} no disponible: ${err.message}`);
        statuses[a.id] = { submitted: false, graded: false };
      }
    }
  }

  const events = await client.call('core_calendar_get_action_events_by_timesort', {
    timesortfrom: now - WEEK,
    timesortto: now + HORIZONTE,
    limitnum: 50,
  });
  reportWarnings(events, 'core_calendar_get_action_events_by_timesort', warn);

  const allForums = courseIds.length
    ? await client.call('mod_forum_get_forums_by_courses', { courseids: courseIds })
    : [];
  reportWarnings(allForums, 'mod_forum_get_forums_by_courses', warn);
  const forums = [];
  for (const f of allForums.filter((f) => f.type === 'news')) {
    const raw = await client.call('mod_forum_get_forum_discussions', {
      forumid: f.id,
      sortorder: SORT_LASTPOST_DESC,
      perpage: 20,
    });
    reportWarnings(raw, 'mod_forum_get_forum_discussions', warn);
    forums.push({ courseId: f.course, forumId: f.id, raw });
  }

  const contents = [];
  for (const id of courseIds) {
    const raw = await client.call('core_course_get_contents', { courseid: id });
    contents.push({ courseId: id, raw });
  }

  return { userid, courses, assignments, statuses, events, forums, contents };
}
