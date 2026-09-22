export function cookieHeader(token) {
  return `bedel_auth=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Comparación en tiempo constante para strings de igual longitud. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(request, env) {
  const token = env?.SITE_TOKEN;
  if (!token) return false;
  return safeEqual(readCookie(request, 'bedel_auth'), token);
}

export async function loginResponse(password, env) {
  if (env?.SITE_PASSWORD && safeEqual(password ?? '', env.SITE_PASSWORD)) {
    return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookieHeader(env.SITE_TOKEN) } });
  }
  return new Response(null, { status: 302, headers: { location: '/login?error=1' } });
}
