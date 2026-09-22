const DAY_MS = 86400000;

/** Primer día ≥ `from` (YYYY-MM-DD) cuyo día de la semana sea `day` (0 = lunes). */
function firstOccurrence(from, day) {
  const [y, m, d] = from.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const dow = (start.getUTCDay() + 6) % 7;
  return new Date(start.getTime() + ((day - dow + 7) % 7) * DAY_MS);
}

/**
 * Genera un iCalendar con un evento semanal por clase del horario.
 * Si `tt.periods` existe, genera una serie por clase y periodo con el UNTIL de cada uno;
 * si no, una única serie con el rango `from`/`until`.
 */
export function buildIcs(tt, { from = '2026-09-14', until = '2027-06-18' } = {}) {
  const spans = tt.periods?.length
    ? tt.periods.map((p) => ({ from: p.from, until: p.to, classes: p.classes ?? [] }))
    : [{ from, until, classes: tt.classes ?? [] }];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bedel//horario//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Instituto'];
  let n = 0;
  spans.forEach((span, pi) => {
    const untilStr = span.until.replace(/-/g, '') + 'T215959Z';
    for (const c of span.classes) {
      const ymd = firstOccurrence(span.from, c.day).toISOString().slice(0, 10).replace(/-/g, '');
      const subj = tt.subjects?.[c.code];
      lines.push(
        'BEGIN:VEVENT',
        `UID:bedel-${pi}-${c.day}-${c.start.replace(':', '')}-${c.code}-${n++}@bedel`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;TZID=Europe/Madrid:${ymd}T${c.start.replace(':', '')}00`,
        `DTEND;TZID=Europe/Madrid:${ymd}T${c.end.replace(':', '')}00`,
        `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`,
        `SUMMARY:${c.code}, ${subj?.name ?? c.code}`,
        `LOCATION:${tt.room ?? ''}`,
        `DESCRIPTION:${tt.teachers?.[c.teacher] ?? c.teacher}`,
        'END:VEVENT',
      );
    }
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const bytes = (s) => new TextEncoder().encode(s).length;

/** Plegado RFC 5545: máximo 75 octetos por línea, continuación con espacio. */
function fold(line) {
  const out = [];
  let cur = '';
  for (const ch of line) {
    const next = cur + ch;
    const limit = out.length ? 74 : 75;   // las continuaciones llevan un espacio inicial
    if (bytes(next) > limit) { out.push(cur); cur = ch; } else { cur = next; }
  }
  out.push(cur);
  return out.map((l, i) => (i ? ' ' + l : l)).join('\r\n');
}
