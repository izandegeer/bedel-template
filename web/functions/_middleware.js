import { isAuthorized } from './lib/auth.js';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.pathname === '/login' || url.pathname === '/login.html' || url.pathname === '/favicon.svg') return next();
  if (isAuthorized(request, env)) return next();
  return Response.redirect(`${url.origin}/login`, 302);
}
