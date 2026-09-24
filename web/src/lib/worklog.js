/**
 * Diario de trabajo por asignatura: qué se ha hecho en los últimos días y
 * cuánto lleva cada asignatura sin tocarse.
 *
 * El log vive en data/manual.json como lista de { date, code, text } ordenada
 * por fecha. Las fechas son YYYY-MM-DD en hora de Madrid, así que aquí se
 * comparan como días de calendario, sin husos ni horas.
 */

/** Días de calendario entre dos claves YYYY-MM-DD (b - a). null si alguna no parsea. */
function diffDays(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
  if (!pa || !pb) return null;
  const ms = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
  return Math.round(ms / 86400000);
}

/**
 * Resumen del diario.
 * @param {Array<{date: string, code: string, text: string}>} log entradas del diario
 * @param {Object} subjects timetable.subjects, { CODE: { name, color } }
 * @param {{ today: string, days?: number }} opts hoy en YYYY-MM-DD y tamaño de la ventana
 * @returns {{ byCode: Object, since: Array<{ code: string, days: number|null, name: string }> }}
 */
export function weekSummary(log, subjects, { today, days = 7 } = {}) {
  const codes = Object.keys(subjects ?? {});
  const entries = (log ?? []).filter((e) => e && codes.includes(e.code));

  // Entradas de la ventana: desde hace days-1 días hasta hoy, ambos incluidos.
  const byCode = {};
  for (const code of codes) {
    const dentro = entries
      .filter((e) => e.code === code)
      .filter((e) => {
        const d = diffDays(e.date, today);
        return d !== null && d >= 0 && d < days;
      })
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((e) => ({ date: e.date, text: e.text }));
    if (dentro.length) byCode[code] = dentro;
  }

  // Días desde la última entrada de cada asignatura, sin contar fechas futuras.
  const since = codes.map((code) => {
    let best = null;
    for (const e of entries) {
      if (e.code !== code) continue;
      const d = diffDays(e.date, today);
      if (d === null || d < 0) continue;
      if (best === null || d < best) best = d;
    }
    return { code, days: best, name: subjects[code]?.name ?? code };
  });
  // De más abandonada a más reciente: nunca (null) primero, luego más días antes.
  since.sort((a, b) => {
    if (a.days === b.days) return a.code.localeCompare(b.code);
    if (a.days === null) return -1;
    if (b.days === null) return 1;
    return b.days - a.days;
  });

  return { byCode, since };
}

/** Texto para los días transcurridos: 'hoy', 'ayer', 'hace N días', 'nunca'. */
export function label(days) {
  if (days === null || days === undefined) return 'nunca';
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}
