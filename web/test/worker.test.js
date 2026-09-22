import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../worker.js';
import { cookieHeader } from '../functions/lib/auth.js';

/** Entorno falso con el binding de assets simulado. */
function makeEnv() {
  return {
    SITE_PASSWORD: 'secreta',
    SITE_TOKEN: 'tok123',
    ASSETS: { fetch: vi.fn(async () => new Response('asset', { status: 200 })) },
  };
}

let env;
beforeEach(() => {
  env = makeEnv();
});

const authCookie = { cookie: 'a=1; bedel_auth=tok123' };

describe('worker: proteccion por contraseña', () => {
  it('sin cookie redirige a /login', async () => {
    const res = await worker.fetch(new Request('https://x/'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://x/login');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('los datos JSON tambien quedan protegidos sin cookie', async () => {
    const res = await worker.fetch(new Request('https://x/data/aules/meta.json'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://x/login');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('con cookie correcta sirve el asset con la request original', async () => {
    const req = new Request('https://x/horario', { headers: authCookie });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(env.ASSETS.fetch.mock.calls[0][0]).toBe(req);
  });

  it('sin SITE_TOKEN falla cerrado aunque haya cookie', async () => {
    const sinToken = { ...makeEnv(), SITE_TOKEN: '' };
    const res = await worker.fetch(new Request('https://x/', { headers: authCookie }), sinToken);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://x/login');
  });
});

describe('worker: rutas publicas', () => {
  it('/favicon.svg pasa sin cookie', async () => {
    const res = await worker.fetch(new Request('https://x/favicon.svg'), env);
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(new URL(env.ASSETS.fetch.mock.calls[0][0].url).pathname).toBe('/favicon.svg');
  });

  it('GET /login sirve login.html sin cookie', async () => {
    const res = await worker.fetch(new Request('https://x/login'), env);
    expect(res.status).toBe(200);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    const pedido = new URL(env.ASSETS.fetch.mock.calls[0][0].url);
    expect(pedido.pathname).toBe('/login.html');
    expect(pedido.origin).toBe('https://x');
  });

  it('GET /login.html tambien sirve login.html', async () => {
    const res = await worker.fetch(new Request('https://x/login.html'), env);
    expect(res.status).toBe(200);
    expect(new URL(env.ASSETS.fetch.mock.calls[0][0].url).pathname).toBe('/login.html');
  });

  it('GET /login?error=1 conserva el 200 del formulario', async () => {
    const res = await worker.fetch(new Request('https://x/login?error=1'), env);
    expect(res.status).toBe(200);
    expect(new URL(env.ASSETS.fetch.mock.calls[0][0].url).pathname).toBe('/login.html');
  });
});

describe('worker: POST /login', () => {
  function postLogin(password) {
    const form = new FormData();
    form.set('password', password);
    return new Request('https://x/login', { method: 'POST', body: form });
  }

  it('contraseña correcta devuelve 302 a / con cookie', async () => {
    const res = await worker.fetch(postLogin('secreta'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toBe(cookieHeader('tok123'));
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('contraseña incorrecta devuelve 302 a /login?error=1 sin cookie', async () => {
    const res = await worker.fetch(postLogin('mal'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('POST sin campo password no autentica', async () => {
    const req = new Request('https://x/login', { method: 'POST', body: new FormData() });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
  });
});
