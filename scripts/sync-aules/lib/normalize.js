const TZ = 'Europe/Madrid';

/** Segundos Unix → ISO 8601 con offset de Madrid, o null si 0. */
export function unixToIso(seconds) {
  if (!seconds) return null;
  const d = new Date(seconds * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'longOffset',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function byDueThenId(a, b) {
  if (a.due === b.due) return a.id.localeCompare(b.id);
  if (a.due === null) return 1;
  if (b.due === null) return -1;
  return a.due.localeCompare(b.due);
}

/**
 * @param {object} raw  respuesta de mod_assign_get_assignments
 * @param {Record<number,{submitted:boolean,graded:boolean}>} statuses  por assignment id
 * @param {{baseUrl:string, courses:Record<string,string>}} config
 */
export function normalizeAssignments(raw, statuses, config) {
  const out = [];
  for (const course of raw.courses ?? []) {
    for (const a of course.assignments ?? []) {
      const status = statuses[a.id] ?? { submitted: false, graded: false };
      out.push({
        id: `aules-${a.id}`,
        courseId: course.id,
        code: codeFor(course.id, config),
        title: a.name,
        due: unixToIso(a.duedate),
        url: `${config.baseUrl}/mod/assign/view.php?id=${a.cmid}`,
        submitted: Boolean(status.submitted),
        graded: Boolean(status.graded),
      });
    }
  }
  return out.sort(byDueThenId);
}

const RESOURCE_KINDS = new Set(['resource', 'url', 'folder', 'page', 'assign', 'quiz']);

function codeFor(courseId, config) {
  return config.courses?.[String(courseId)] ?? null;
}

/** Entidad numérica → carácter; si está fuera de rango Unicode se deja tal cual. */
function codePointOr(original, cp) {
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : original;
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '\u2019').replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201c').replace(/&rdquo;/g, '\u201d')
    .replace(/&#(\d+);/g, (m, n) => codePointOr(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePointOr(m, parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeCourses(rawCourses, config) {
  return (rawCourses ?? [])
    .map((c) => ({
      id: c.id,
      code: codeFor(c.id, config),
      fullname: c.fullname,
      shortname: c.shortname,
      url: `${config.baseUrl}/course/view.php?id=${c.id}`,
    }))
    .sort((a, b) => a.id - b.id);
}

export function normalizeEvents(raw, config) {
  const hasMapping = Object.keys(config.courses ?? {}).length > 0;
  return (raw.events ?? [])
    .filter((e) => e.eventtype !== 'due')
    // Con mapeo definido, fuera los eventos de cursos no mapeados (p. ej. del año pasado).
    .filter((e) => !hasMapping || !e.course || codeFor(e.course.id, config) !== null)
    .map((e) => ({
      id: `aules-ev-${e.id}`,
      courseId: e.course?.id ?? null,
      code: e.course ? codeFor(e.course.id, config) : null,
      title: e.name,
      start: unixToIso(e.timestart),
      type: e.eventtype,
      url: e.url ?? null,
    }))
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.id.localeCompare(b.id));
}

/** @param {{courseId:number, forumId:number, raw:object}[]} perForum */
export function normalizeAnnouncements(perForum, config) {
  const out = [];
  for (const { courseId, raw } of perForum) {
    for (const d of raw.discussions ?? []) {
      out.push({
        id: `aules-an-${d.discussion}`,
        courseId,
        code: codeFor(courseId, config),
        title: d.name,
        text: stripHtml(d.message),
        html: d.message,
        author: d.userfullname,
        date: unixToIso(d.timemodified),
        url: `${config.baseUrl}/mod/forum/discuss.php?d=${d.discussion}`,
      });
    }
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}

/** @param {{courseId:number, raw:object[]}[]} perCourse */
export function normalizeResources(perCourse, config) {
  const out = [];
  for (const { courseId, raw } of perCourse) {
    for (const section of raw ?? []) {
      for (const m of section.modules ?? []) {
        if (!RESOURCE_KINDS.has(m.modname)) continue;
        const first = m.contents?.[0];
        out.push({
          id: `aules-res-${m.id}`,
          courseId,
          code: codeFor(courseId, config),
          section: section.name,
          title: stripHtml(m.name),
          kind: m.modname,
          url: m.url,
          href: first?.fileurl ?? m.url,
          filename: first?.type === 'file' ? first.filename : null,
          modified: unixToIso(first?.timemodified ?? 0),
        });
      }
    }
  }
  return out.sort((a, b) => a.courseId - b.courseId || a.id.localeCompare(b.id));
}
