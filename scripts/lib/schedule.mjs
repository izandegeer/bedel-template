// Programación del ciclo de sincronización: launchd en Mac, schtasks en Windows.
// Todo lo que ejecuta comandos recibe un run inyectable para poder doblarlo en los tests.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const LABEL = 'com.bedel.sync';
export const TAREA = 'Bedel Sync';

// Ruta del plist del agente en el home que se le pase.
export function rutaPlist(home) {
  return join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

// Escapa lo que XML no admite dentro de un <string>.
function xml(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function rutaSync(cfg) {
  return join(cfg.root, 'scripts', 'sync.mjs');
}

// PATH para launchd: no hereda el de la shell y el deploy necesita npm y npx.
function pathDelAgente(cfg) {
  return `${dirname(cfg.nodeBin)}:/usr/local/bin:/usr/bin:/bin`;
}

export function launchdPlist(cfg) {
  const log = join(cfg.root, cfg.logFile);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(cfg.nodeBin)}</string>
    <string>${xml(rutaSync(cfg))}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(pathDelAgente(cfg))}</string>
  </dict>
  <key>StartInterval</key>
  <integer>${cfg.syncIntervalMinutes * 60}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`;
}

export function installLaunchd(cfg, run, { home }) {
  const plist = rutaPlist(home);
  mkdirSync(dirname(plist), { recursive: true });
  writeFileSync(plist, launchdPlist(cfg));
  const dominio = `gui/${process.getuid()}`;
  // El bootout falla si el agente no estaba cargado: da igual, es solo para recargarlo.
  run('launchctl', ['bootout', `${dominio}/${LABEL}`], { quiet: true });
  const r = run('launchctl', ['bootstrap', dominio, plist]);
  return { platform: 'darwin', installed: r.code === 0, plist, label: LABEL };
}

export function uninstallLaunchd(cfg, run, { home }) {
  run('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { quiet: true });
  const plist = rutaPlist(home);
  rmSync(plist, { force: true });
  return { platform: 'darwin', installed: false, plist, label: LABEL };
}

export function schtasksArgs(cfg) {
  return [
    '/Create', '/SC', 'MINUTE', '/MO', String(cfg.syncIntervalMinutes),
    '/TN', TAREA,
    // Las rutas van entre comillas porque pueden llevar espacios.
    '/TR', `"${cfg.nodeBin}" "${rutaSync(cfg)}"`,
    '/F',
  ];
}

export function installSchtasks(cfg, run) {
  const r = run('schtasks', schtasksArgs(cfg));
  return { platform: 'win32', installed: r.code === 0, tarea: TAREA };
}

export function uninstallSchtasks(cfg, run) {
  run('schtasks', ['/Delete', '/TN', TAREA, '/F']);
  return { platform: 'win32', installed: false, tarea: TAREA };
}

// Línea de cron equivalente, para los sistemas sin launchd ni schtasks.
function lineaCron(cfg) {
  return `*/${cfg.syncIntervalMinutes} * * * * "${cfg.nodeBin}" "${rutaSync(cfg)}" >> "${join(cfg.root, cfg.logFile)}" 2>&1`;
}

export function install(cfg, run, { platform = process.platform, home = process.env.HOME ?? '' } = {}) {
  if (platform === 'darwin') return installLaunchd(cfg, run, { home });
  if (platform === 'win32') return installSchtasks(cfg, run);
  const cron = lineaCron(cfg);
  console.log('Este sistema no usa launchd ni schtasks. Añade esta línea con "crontab -e":');
  console.log(cron);
  return { platform, installed: false, cron };
}

export function uninstall(cfg, run, { platform = process.platform, home = process.env.HOME ?? '' } = {}) {
  if (platform === 'darwin') return uninstallLaunchd(cfg, run, { home });
  if (platform === 'win32') return uninstallSchtasks(cfg, run);
  console.log('Este sistema no usa launchd ni schtasks. Quita la línea del sync con "crontab -e".');
  return { platform, installed: false };
}

export function status(cfg, run, { platform = process.platform } = {}) {
  if (platform === 'darwin') {
    const r = run('launchctl', ['list'], { quiet: true });
    const linea = r.stdout.split('\n').find((l) => l.includes(LABEL)) ?? '';
    return { platform, installed: linea !== '', salida: linea };
  }
  if (platform === 'win32') {
    const r = run('schtasks', ['/Query', '/TN', TAREA], { quiet: true });
    return { platform, installed: r.code === 0 && r.stdout.includes(TAREA), salida: r.stdout.trim() };
  }
  return { platform, installed: false, salida: '' };
}
