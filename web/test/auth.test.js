import { describe, it, expect } from 'vitest';
import { isAuthorized, loginResponse, cookieHeader } from '../functions/lib/auth.js';

const env = { SITE_PASSWORD: 'secreta', SITE_TOKEN: 'tok123' };

describe('isAuthorized', () => {
  it('true con cookie bedel_auth igual al token', () => {
    const req = new Request('https://x/', { headers: { cookie: 'a=1; bedel_auth=tok123' } });
    expect(isAuthorized(req, env)).toBe(true);
  });
  it('false sin cookie o con token distinto', () => {
    expect(isAuthorized(new Request('https://x/'), env)).toBe(false);
    expect(isAuthorized(new Request('https://x/', { headers: { cookie: 'bedel_auth=otro' } }), env)).toBe(false);
  });
  it('false si el entorno no tiene token (fallo cerrado)', () => {
    const req = new Request('https://x/', { headers: { cookie: 'bedel_auth=' } });
    expect(isAuthorized(req, { SITE_PASSWORD: 'x', SITE_TOKEN: '' })).toBe(false);
  });
});

describe('loginResponse', () => {
  it('contraseña correcta → 302 a / con Set-Cookie HttpOnly', async () => {
    const res = await loginResponse('secreta', env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toBe(cookieHeader('tok123'));
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=31536000/);
  });
  it('contraseña incorrecta → 302 a /login?error=1 sin cookie', async () => {
    const res = await loginResponse('mal', env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

import { onRequest } from '../functions/_middleware.js';
describe('middleware', () => {
  const next = async () => new Response('ok', { status: 200 });
  it('deja pasar /login y /favicon.svg sin cookie', async () => {
    for (const path of ['/login', '/favicon.svg']) {
      const res = await onRequest({ request: new Request(`https://x${path}`), env, next });
      expect(res.status).toBe(200);
    }
  });
  it('redirige el resto sin cookie', async () => {
    const res = await onRequest({ request: new Request('https://x/data/aules/meta.json'), env, next });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://x/login');
  });
});
