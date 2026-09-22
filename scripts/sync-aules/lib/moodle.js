import { flatten } from './params.js';

export class MoodleError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'MoodleError';
    this.code = code;
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente mínimo del REST de Moodle, con reintentos ante fallos transitorios.
 * @param {{ baseUrl: string, token: string, fetchImpl?: typeof fetch, timeoutMs?: number,
 *           retries?: number, sleepImpl?: (ms:number)=>Promise<void> }} opts
 */
export function createClient({
  baseUrl, token, fetchImpl = fetch, timeoutMs = 30_000,
  retries = 2, sleepImpl = defaultSleep,
}) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/webservice/rest/server.php`;

  // Un solo intento. Marca con `retryable` los fallos que merece la pena repetir:
  // caídas de red o timeouts (excepción del fetch) y errores 5xx del servidor.
  async function attempt(wsfunction, args) {
    const body = new URLSearchParams({
      wstoken: token,
      wsfunction,
      moodlewsrestformat: 'json',
      ...flatten(args),
    });
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e?.name === 'TimeoutError') {
        const err = new Error(`Timeout (${timeoutMs}ms) llamando a ${wsfunction}`);
        err.retryable = true;
        throw err;
      }
      if (e && typeof e === 'object') e.retryable = true;
      throw e;
    }
    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(`HTTP ${res.status} llamando a ${wsfunction}: ${detail.slice(0, 200)}`);
      err.retryable = res.status >= 500;
      throw err;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Respuesta no JSON de ${wsfunction}: ${text.slice(0, 200)}`);
    }
    if (data && typeof data === 'object' && 'exception' in data) {
      throw new MoodleError(data.errorcode ?? 'unknown', data.message ?? data.exception);
    }
    return data;
  }

  async function call(wsfunction, args = {}) {
    for (let intento = 0; ; intento++) {
      try {
        return await attempt(wsfunction, args);
      } catch (err) {
        if (!err?.retryable || intento >= retries) throw err;
        await sleepImpl(500 * 2 ** intento);
      }
    }
  }

  return { call };
}
