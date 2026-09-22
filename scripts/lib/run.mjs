// Ejecuta un comando y devuelve su código de salida y su salida, sin lanzar excepciones.
// Toda función que ejecute comandos recibe este run como parámetro para poder doblarlo en los tests.
import { spawnSync } from 'node:child_process';

export function run(cmd, args, { cwd, input, env, quiet, inherit } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    input,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    // Con inherit el comando habla directamente con el terminal: hace falta para los que
    // piden algo por su cuenta, como "wrangler login". A cambio no se puede leer su salida.
    stdio: inherit ? 'inherit' : [input == null ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    // En Windows npm y npx son ficheros .cmd, que solo se pueden ejecutar a través del shell.
    shell: process.platform === 'win32',
  });
  if (!quiet && r.stdout) process.stdout.write(r.stdout);
  if (!quiet && r.stderr) process.stderr.write(r.stderr);
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
