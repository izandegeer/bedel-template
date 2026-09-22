import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LABEL, TAREA, install, installLaunchd, installSchtasks, launchdPlist, rutaPlist, schtasksArgs, status, uninstall } from './schedule.mjs';

// Doble de run: registra las llamadas y devuelve el código o la salida que se le indique por comando.
function dobleRun(respuestas = {}) {
  const llamadas = [];
  const run = (cmd, args, opts = {}) => {
    llamadas.push([cmd, args, opts.cwd]);
    const clave = [cmd, ...args].join(' ');
    const entrada = Object.entries(respuestas).find(([k]) => clave.includes(k));
    const r = entrada ? entrada[1] : 0;
    return typeof r === 'number' ? { code: r, stdout: '', stderr: '' } : { code: 0, stdout: '', stderr: '', ...r };
  };
  run.llamadas = llamadas;
  return run;
}

const cfg = {
  root: '/Users/quien/Mi Repo/bedel',
  nodeBin: '/opt/node v22/bin/node',
  syncIntervalMinutes: 120,
  logFile: 'logs/sync.log',
};

test('launchdPlist incluye label, rutas, intervalo y log', () => {
  const plist = launchdPlist(cfg);
  assert.match(plist, /<key>Label<\/key>\s*<string>com\.bedel\.sync<\/string>/);
  assert.match(plist, /<string>\/opt\/node v22\/bin\/node<\/string>/);
  assert.ok(plist.includes(join(cfg.root, 'scripts', 'sync.mjs')));
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>7200<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.ok(plist.includes(join(cfg.root, 'logs', 'sync.log')));
  assert.match(plist, /<key>StandardOutPath<\/key>/);
  assert.match(plist, /<key>StandardErrorPath<\/key>/);
});

test('launchdPlist incluye PATH con el directorio de node delante', () => {
  const plist = launchdPlist(cfg);
  // launchd no hereda PATH y el deploy necesita npm y npx.
  assert.ok(plist.includes('<string>/opt/node v22/bin:/usr/local/bin:/usr/bin:/bin</string>'));
  assert.match(plist, /<key>EnvironmentVariables<\/key>/);
  assert.match(plist, /<key>PATH<\/key>/);
});

test('launchdPlist escapa los caracteres especiales de XML en las rutas', () => {
  const plist = launchdPlist({ ...cfg, root: '/tmp/a&b<c>d', nodeBin: '/bin/no&de' });
  assert.ok(plist.includes('/bin/no&amp;de'));
  assert.ok(!plist.includes('/bin/no&de'));
  assert.ok(plist.includes('/tmp/a&amp;b&lt;c&gt;d'));
});

test('launchdPlist respeta un intervalo distinto', () => {
  assert.match(launchdPlist({ ...cfg, syncIntervalMinutes: 30 }), /<integer>1800<\/integer>/);
});

test('installLaunchd escribe el plist y lo recarga con launchctl', () => {
  const home = mkdtempSync(join(tmpdir(), 'bedel-home-'));
  const run = dobleRun();
  const r = installLaunchd({ ...cfg, root: home }, run, { home });
  const ruta = join(home, 'Library', 'LaunchAgents', 'com.bedel.sync.plist');
  assert.equal(r.plist, ruta);
  assert.ok(existsSync(ruta));
  assert.ok(readFileSync(ruta, 'utf8').includes(LABEL));
  const uid = String(process.getuid());
  assert.deepEqual(run.llamadas.map(([cmd, args]) => [cmd, args]), [
    ['launchctl', ['bootout', `gui/${uid}/${LABEL}`]],
    ['launchctl', ['bootstrap', `gui/${uid}`, ruta]],
  ]);
});

test('uninstall con launchd hace bootout y borra el plist', () => {
  const home = mkdtempSync(join(tmpdir(), 'bedel-home-'));
  const run = dobleRun();
  installLaunchd({ ...cfg, root: home }, run, { home });
  const ruta = rutaPlist(home);
  assert.ok(existsSync(ruta));

  const run2 = dobleRun();
  const r = uninstall(cfg, run2, { platform: 'darwin', home });
  assert.equal(r.installed, false);
  assert.ok(!existsSync(ruta));
  assert.equal(run2.llamadas[0][0], 'launchctl');
  assert.equal(run2.llamadas[0][1][0], 'bootout');
});

test('schtasksArgs cita las rutas con espacios', () => {
  assert.deepEqual(schtasksArgs(cfg), [
    '/Create', '/SC', 'MINUTE', '/MO', '120',
    '/TN', TAREA,
    '/TR', `"${cfg.nodeBin}" "${join(cfg.root, 'scripts', 'sync.mjs')}"`,
    '/F',
  ]);
});

test('schtasksArgs usa el intervalo de la configuración', () => {
  assert.deepEqual(schtasksArgs({ ...cfg, syncIntervalMinutes: 120 }).slice(0, 5), ['/Create', '/SC', 'MINUTE', '/MO', '120']);
  assert.deepEqual(schtasksArgs({ ...cfg, syncIntervalMinutes: 15 })[4], '15');
});

test('installSchtasks llama a schtasks con los argumentos', () => {
  const run = dobleRun();
  const r = installSchtasks(cfg, run);
  assert.equal(r.installed, true);
  assert.deepEqual(run.llamadas[0][0], 'schtasks');
  assert.deepEqual(run.llamadas[0][1], schtasksArgs(cfg));
});

test('install elige launchctl en Mac y schtasks en Windows', () => {
  const home = mkdtempSync(join(tmpdir(), 'bedel-home-'));
  const mac = dobleRun();
  const rMac = install({ ...cfg, root: home }, mac, { platform: 'darwin', home });
  assert.equal(rMac.platform, 'darwin');
  assert.equal(rMac.installed, true);
  assert.ok(mac.llamadas.every(([cmd]) => cmd === 'launchctl'));

  const win = dobleRun();
  const rWin = install(cfg, win, { platform: 'win32', home });
  assert.equal(rWin.platform, 'win32');
  assert.equal(rWin.installed, true);
  assert.deepEqual(win.llamadas.map(([cmd]) => cmd), ['schtasks']);
});

test('install en otras plataformas no llama a run y devuelve installed false', () => {
  const run = dobleRun();
  const r = install(cfg, run, { platform: 'linux', home: '/home/quien' });
  assert.deepEqual(run.llamadas, []);
  assert.equal(r.platform, 'linux');
  assert.equal(r.installed, false);
  assert.match(r.cron, /sync\.mjs/);
});

test('uninstall en Windows borra la tarea', () => {
  const run = dobleRun();
  const r = uninstall(cfg, run, { platform: 'win32', home: 'C:\\Users\\quien' });
  assert.equal(r.installed, false);
  assert.deepEqual(run.llamadas[0][0], 'schtasks');
  assert.deepEqual(run.llamadas[0][1], ['/Delete', '/TN', TAREA, '/F']);
});

test('status consulta launchctl en Mac y schtasks en Windows', () => {
  const mac = dobleRun({ 'launchctl list': { code: 0, stdout: `-\t0\t${LABEL}\n` } });
  const rMac = status(cfg, mac, { platform: 'darwin' });
  assert.equal(rMac.installed, true);
  assert.ok(rMac.salida.includes(LABEL));
  assert.equal(mac.llamadas[0][0], 'launchctl');

  const noInstalado = dobleRun({ 'launchctl list': { code: 0, stdout: 'otra cosa\n' } });
  assert.equal(status(cfg, noInstalado, { platform: 'darwin' }).installed, false);

  const win = dobleRun({ schtasks: { code: 0, stdout: `${TAREA} listo` } });
  const rWin = status(cfg, win, { platform: 'win32' });
  assert.equal(rWin.installed, true);
  assert.deepEqual(win.llamadas[0][1], ['/Query', '/TN', TAREA]);
});

test('el plist generado con la configuración real del repo es XML válido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bedel-plist-'));
  const ruta = join(dir, 'prueba.plist');
  writeFileSync(ruta, launchdPlist(cfg));
  assert.match(readFileSync(ruta, 'utf8'), /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
});
