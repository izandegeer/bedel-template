import { loginResponse } from './lib/auth.js';

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  return loginResponse(String(form.get('password') ?? ''), env);
}

export async function onRequestGet({ env }) {
  return env.ASSETS.fetch(new Request('https://placeholder/login.html'));
}
