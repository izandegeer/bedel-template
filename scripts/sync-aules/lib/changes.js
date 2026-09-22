const DAY = 86400000;

/** Diferencias entre dos listas de entregas: tareas nuevas y cambios de fecha límite. */
export function detectChanges(prev, next, at = new Date().toISOString()) {
  if (!Array.isArray(prev)) return [];
  const before = new Map(prev.map((x) => [x.id, x]));
  const out = [];
  for (const x of next ?? []) {
    const p = before.get(x.id);
    if (!p) {
      out.push({ id: x.id, code: x.code, title: x.title, type: 'new', due: x.due ?? null, at });
    } else if ((p.due ?? null) !== (x.due ?? null)) {
      out.push({ id: x.id, code: x.code, title: x.title, type: 'due', from: p.due ?? null, to: x.due ?? null, at });
    }
  }
  return out;
}

/** Une el historial con los cambios nuevos: sin duplicados por id+tipo (gana el más reciente), ordenado por fecha desc, máximo `maxDays`. */
export function mergeChanges(existing, fresh, at = new Date().toISOString(), maxDays = 30) {
  const limit = new Date(at).getTime() - maxDays * DAY;
  const byKey = new Map();
  for (const c of [...(existing ?? []), ...(fresh ?? [])]) {
    if (new Date(c.at).getTime() < limit) continue;
    const key = `${c.id}|${c.type}`;
    const cur = byKey.get(key);
    if (!cur || cur.at < c.at) byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
