/**
 * Aplana un objeto de argumentos al formato que espera el REST de Moodle:
 * { courseids: [1, 2] } → { 'courseids[0]': '1', 'courseids[1]': '2' }
 */
export function flatten(args, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value) || (typeof value === 'object')) {
      flatten(value, name, out);
    } else {
      out[name] = String(value);
    }
  }
  return out;
}
