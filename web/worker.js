// web/worker.js - despliegue alternativo en Cloudflare Workers con static assets.
// Replica la logica de web/functions/ (Pages Functions) reutilizando lib/auth.js.
// Necesita run_worker_first = true en wrangler.worker.toml para ver todas las peticiones.
import { isAuthorized, loginResponse } from './functions/lib/auth.js';

/** Sirve un fichero del bundle de assets por ruta absoluta. */
function asset(path, request, env) {
  return env.ASSETS.fetch(new Request(new URL(path, request.url), { headers: request.headers }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/login' || url.pathname === '/login.html') {
      if (request.method === 'POST') {
        const form = await request.formData();
        return loginResponse(String(form.get('password') ?? ''), env);
      }
      return asset('/login.html', request, env);
    }

    if (url.pathname === '/favicon.svg') return asset('/favicon.svg', request, env);

    if (isAuthorized(request, env)) return env.ASSETS.fetch(request);

    return Response.redirect(`${url.origin}/login`, 302);
  },
};
