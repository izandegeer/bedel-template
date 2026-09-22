// scripts/sync-aules/test/moodle.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../lib/moodle.js';

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: new URLSearchParams(init.body) });
    const data = handler(calls.at(-1));
    return {
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  };
  return { fetchImpl, calls };
}

test('llama al endpoint REST con token, función y formato json', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ userid: 7 }));
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl });
  const result = await client.call('core_webservice_get_site_info');
  assert.deepEqual(result, { userid: 7 });
  assert.equal(calls[0].url, 'https://aules.test/fp/webservice/rest/server.php');
  assert.equal(calls[0].body.get('wstoken'), 'abc');
  assert.equal(calls[0].body.get('wsfunction'), 'core_webservice_get_site_info');
  assert.equal(calls[0].body.get('moodlewsrestformat'), 'json');
});

test('aplana los argumentos en el cuerpo', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({}));
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl });
  await client.call('mod_assign_get_assignments', { courseids: [1, 2] });
  assert.equal(calls[0].body.get('courseids[0]'), '1');
  assert.equal(calls[0].body.get('courseids[1]'), '2');
});

test('una respuesta con exception lanza MoodleError con el errorcode', async () => {
  const { fetchImpl } = fakeFetch(() => ({
    exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Token inválido',
  }));
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl });
  await assert.rejects(
    () => client.call('core_webservice_get_site_info'),
    (err) => err.name === 'MoodleError' && err.code === 'invalidtoken',
  );
});

test('un HTTP no ok lanza error con el status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => '' });
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => client.call('x'), /HTTP 503/);
});

test('un HTTP no ok incluye el principio del cuerpo en el error', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'Base de datos caída' });
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => client.call('x'), /HTTP 500 llamando a x: Base de datos caída/);
});

test('un timeout de fetch se traduce en un error con contexto', async () => {
  const fetchImpl = async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  };
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, timeoutMs: 1234, sleepImpl: async () => {} });
  await assert.rejects(() => client.call('x'), /Timeout \(1234ms\) llamando a x/);
});

test('los errores de red que no son timeout se relanzan tal cual', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {} });
  await assert.rejects(() => client.call('x'), (err) => err instanceof TypeError && /fetch failed/.test(err.message));
});

test('una respuesta no JSON lanza un error con el nombre de la función', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => '<html>mantenimiento</html>',
  });
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl });
  await assert.rejects(() => client.call('x'), /Respuesta no JSON de x/);
});

test('pasa un AbortSignal de timeout a fetch', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({}));
  const client = createClient({ baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl });
  await client.call('core_webservice_get_site_info');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('reintenta los 5xx hasta que responde bien', async () => {
  const calls = [];
  const waits = [];
  const fetchImpl = async () => {
    calls.push(1);
    if (calls.length < 3) return { ok: false, status: 503, text: async () => 'caído' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ userid: 7 }) };
  };
  const client = createClient({
    baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl,
    sleepImpl: async (ms) => { waits.push(ms); },
  });
  const result = await client.call('core_webservice_get_site_info');
  assert.deepEqual(result, { userid: 7 });
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test('reintenta los errores de red', async () => {
  const calls = [];
  const fetchImpl = async () => {
    calls.push(1);
    if (calls.length < 2) throw new TypeError('fetch failed');
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: 1 }) };
  };
  const client = createClient({
    baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {},
  });
  assert.deepEqual(await client.call('x'), { ok: 1 });
  assert.equal(calls.length, 2);
});

test('no reintenta un MoodleError de token inválido', async () => {
  const calls = [];
  const fetchImpl = async () => {
    calls.push(1);
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Token inválido' }),
    };
  };
  const client = createClient({
    baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {},
  });
  await assert.rejects(() => client.call('x'), (err) => err.name === 'MoodleError');
  assert.equal(calls.length, 1);
});

test('no reintenta un HTTP 4xx', async () => {
  const calls = [];
  const fetchImpl = async () => { calls.push(1); return { ok: false, status: 403, text: async () => 'prohibido' }; };
  const client = createClient({
    baseUrl: 'https://aules.test/fp', token: 'abc', fetchImpl, sleepImpl: async () => {},
  });
  await assert.rejects(() => client.call('x'), /HTTP 403/);
  assert.equal(calls.length, 1);
});
