#!/usr/bin/env node
// Instalador de Bedel en una máquina nueva. Se puede volver a ejecutar cuando se quiera:
// cada paso detecta lo que ya está hecho (config, token, proyecto de Pages).
// Uso: npm run setup
//      npm run setup -- --sin-cloudflare   salta Cloudflare y el despliegue (para probar)
import { loadConfig } from './lib/config.mjs';
import { run } from './lib/run.mjs';
import * as prompt from './lib/prompt.mjs';
import {
  ponerSecretos, stepCloudflare, stepConfig, stepDeploy, stepFirstSync, stepSchedule, stepToken,
} from './lib/setup-steps.mjs';

const sinCloudflare = process.argv.slice(2).includes('--sin-cloudflare');

function titulo(n, texto) {
  console.log(`\n== ${n}. ${texto} ==`);
}

let cfg = loadConfig();

titulo(1, 'Configuración de esta máquina');
const config = await stepConfig({ cfg, prompt });
// El nombre del proyecto de Pages lo necesita todo lo demás, así que se recarga la config.
cfg = loadConfig();
if (!config.creado) console.log(`bedel.config.json ya estaba, proyecto "${cfg.pagesProject}".`);

titulo(2, 'Token de Aules');
const token = await stepToken({ cfg, prompt });
if (!token.ok) process.exit(1);

titulo(3, 'Primera sincronización con Aules');
const sync = await stepFirstSync({ cfg, run });
if (!sync.ok) process.exit(1);

let despliegue = { pagesUrl: null, workerUrl: null };
if (sinCloudflare) {
  console.log('\n--sin-cloudflare: se salta Cloudflare y el despliegue.');
} else {
  titulo(4, 'Cloudflare');
  const cloudflare = await stepCloudflare({ cfg, run, prompt });
  if (!cloudflare.ok) process.exit(1);

  titulo(5, 'Despliegue de la web');
  despliegue = await stepDeploy({ cfg, run });

  // Los secretos del worker fallan si el worker aún no existía: ahora ya está desplegado.
  if (cloudflare.pendientes?.length) {
    const siguenFallando = ponerSecretos({ cfg, run }, cloudflare.pendientes);
    if (siguenFallando.length) {
      console.log('Estos secretos no se pudieron guardar, ejecuta "npm run setup" otra vez:');
      for (const s of siguenFallando) console.log(`  ${s.nombre} en ${s.destino}`);
    } else {
      console.log('Secretos del worker guardados.');
    }
  }
}

titulo(6, 'Sincronización automática');
await stepSchedule({ cfg, run, prompt });
prompt.close(); // no hay más preguntas: liberar la entrada para que el proceso pueda terminar

console.log('\n== Listo ==');
if (despliegue.pagesUrl) console.log(`Web:     ${despliegue.pagesUrl}`);
if (despliegue.workerUrl) console.log(`         ${despliegue.workerUrl} (esta es la que funciona en el instituto)`);
console.log('');
console.log('Día a día:');
console.log('  npm run sync                       sincroniza con Aules y publica la web');
console.log('  npm run falta -- DWS               apunta una falta de hoy en esa asignatura');
console.log('  npm run evento -- DWS "Examen de la U1" 2026-10-01');
console.log('  npm run schedule -- --estado       comprueba la tarea programada');
