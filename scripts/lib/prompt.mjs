// Preguntas por el terminal para el instalador. Sin tests automáticos porque es interactivo:
// se prueba a mano con "node -e". Todo lo que lo usa lo recibe inyectado para poder doblarlo.
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

// Una sola interfaz para todas las preguntas, con las líneas en una cola. Hace falta porque
// cuando la entrada es un fichero o un pipe llegan todas de golpe: si no se guardaran,
// las preguntas siguientes a la primera se quedarían esperando para siempre.
let interfaz = null;
let callar = false;
let cerrada = false;
const lineas = [];
const esperando = [];

// Salida de readline con interruptor: al preguntar una contraseña se calla el eco de las teclas.
const salida = new Writable({
  write(trozo, codificacion, hecho) {
    if (!callar) process.stdout.write(trozo, codificacion);
    hecho();
  },
});

function iface() {
  if (interfaz) return interfaz;
  // terminal: true solo si de verdad hay terminal; así readline gestiona las teclas, también en Windows.
  interfaz = createInterface({ input: process.stdin, output: salida, terminal: process.stdin.isTTY === true });
  interfaz.on('line', (linea) => {
    const resolver = esperando.shift();
    if (resolver) resolver(linea);
    else lineas.push(linea);
  });
  // Si la entrada se acaba, las preguntas pendientes (y las siguientes) se responden
  // en vacío en vez de colgarse.
  interfaz.on('close', () => {
    cerrada = true;
    while (esperando.length) esperando.shift()('');
  });
  return interfaz;
}

function leerLinea() {
  iface();
  if (lineas.length) return Promise.resolve(lineas.shift());
  if (cerrada) return Promise.resolve('');
  return new Promise((resolver) => esperando.push(resolver));
}

// Cierra la interfaz para que el proceso pueda terminar. Se llama al acabar el instalador.
export function close() {
  interfaz?.close();
  interfaz = null;
  callar = false;
  cerrada = false;
  lineas.length = 0;
}

// Escribe la pregunta con el prompt de readline: así, en un terminal de verdad, readline
// sabe cuánto ocupa y no repinta la línea encima de ella al teclear.
function preguntar(question) {
  const rl = iface();
  rl.setPrompt(question);
  rl.prompt();
}

// Pregunta y devuelve la respuesta sin espacios alrededor.
export async function ask(question) {
  preguntar(question);
  return String(await leerLinea()).trim();
}

/**
 * Igual que ask pero sin eco: para contraseñas. Mientras espera la respuesta calla todo lo
 * que readline quiera pintar, así que no se ve lo que se teclea. Si la entrada no es un
 * terminal (un heredoc, un pipe) no hay eco que ocultar y lee la línea tal cual.
 */
export async function askSecret(question) {
  preguntar(question);
  callar = true; // la pregunta ya está escrita: desde aquí, silencio
  try {
    return String(await leerLinea()).trim();
  } finally {
    callar = false;
    if (process.stdin.isTTY) process.stdout.write('\n'); // el salto de línea que no se ha visto
  }
}

const SI = ['s', 'si', 'sí', 'y', 'yes'];

// Pregunta de sí o no. Con la respuesta vacía se queda con el valor por defecto.
export async function confirm(question, def = true) {
  const respuesta = (await ask(`${question} ${def ? '[S/n]' : '[s/N]'} `)).toLowerCase();
  if (!respuesta) return def;
  return SI.includes(respuesta);
}
