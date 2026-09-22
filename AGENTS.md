# Instrucciones para asistentes de IA

Bedel es el hub de logística del curso de 2º DAW tarde del IES Mutxamel: horario, entregas de Aules, material, avisos, exámenes y faltas. Todo son ficheros JSON en `data/`, un sincronizador Node que lee la API de Moodle de Aules y una web Vue 3 protegida por contraseña que se despliega en Cloudflare Pages y Workers.

## Requisitos

Node 22 o superior, git, sesión de wrangler en una cuenta de Cloudflare y un token de Aules en `.env` (`AULES_TOKEN=...`). Sin dependencias npm en la raíz: la web tiene las suyas en `web/`.

## Montar Bedel desde cero (primera vez)

Si el usuario te pide montarlo a partir de su copia de la plantilla:

1. Comprueba `node -v` (22 o superior) y `git --version`. Si falta algo, ayúdale a instalarlo antes de seguir.
2. Clona su repo y entra en la carpeta. Ejecuta `npm install` dentro de `web/`.
3. Ejecuta `npm run setup` desde la raíz. **Es interactivo**: pide el nombre del proyecto de Cloudflare, usuario y contraseña de Aules, hace login en Cloudflare abriendo el navegador, pide la contraseña de la web dos veces y pregunta si programar el sync. Nunca inventes ni pidas al usuario que te escriba sus contraseñas en el chat: si tu entorno no puede ejecutar comandos interactivos, dile que ejecute él `npm run setup` en su terminal y espera a que te diga que ha terminado. Si ya ha ejecutado el instalador antes, es seguro repetirlo: detecta lo que ya está hecho.
4. Al acabar, el instalador imprime dos URLs (`*.pages.dev` y `*.workers.dev`). Díselas y explícale que en el instituto solo funciona la de `workers.dev`. Si te pide guardarlas, escríbelas al principio de su `README.md` y haz commit.
5. Si el instalador dice que Aules devolvió menos cursos de los mapeados, ejecuta `npm run discover`, compara con `data/config.json` y corrige el mapeo id a código con ayuda del usuario. Luego repite `npm run setup`.

## Mapa de `data/`

| Fichero | Qué es | Quién lo edita |
|---|---|---|
| `timetable.json` | Aula, clases por día (`day` 0 = lunes), `subjects` (nombre y color), `teachers`, `periods` (septiembre y junio 45 min, octubre a mayo 55 min) | a mano |
| `manual.json` | Lo que no viene de Aules: `events`, `deadlines`, `notes`, `done`, `absences` | a mano o con `npm run falta` / `npm run evento` |
| `config.json` | `baseUrl` de Aules y `courses`: id de curso de Aules a código de asignatura | a mano, con ayuda de `npm run discover` |
| `modules.json` | Horas oficiales y `weekly` por módulo, `limitPercent` 15 | a mano |
| `calendar.json` | Curso lectivo (`lective`), `holidays` con rangos inclusive, `pendingLective` | a mano |
| `links.json` | Enlaces propios por código de asignatura | a mano |
| `aules/*.json` | `announcements`, `assignments`, `changes`, `courses`, `events`, `resources`, `meta` | **lo genera el sync, nunca a mano** |

Fechas: siempre ISO. Día suelto `YYYY-MM-DD` (`date`, `due` de eventos, `from`/`to`). Fecha con hora `YYYY-MM-DDTHH:MM` en hora local, sin zona (`due` de `deadlines`). JSON con sangría de 2 espacios y salto de línea final.

Códigos de asignatura (3 letras, los de `subjects` de `timetable.json`):

| Código | Asignatura |
|---|---|
| DWC | Desarrollo Web Entorno Cliente |
| DWS | Desarrollo Web Entorno Servidor |
| DAW | Despliegue de Aplicaciones Web |
| DIW | Diseño de Interfaces Web |
| IPE | Itinerario Empleabilidad II |
| PRO | Proyecto Intermodular II |
| ING | Inglés Oral (Optativa) |
| DIG | Digitalización Sector Productivo |
| SOS | Sostenibilidad Sector Productivo |

`config.json` mapea además `TUT` (tutoría), que no es un módulo y no aparece en `subjects`.

## Comandos

```bash
npm run setup                    # instalador, reejecutable; --sin-cloudflare salta el despliegue
npm run sync                     # Aules + commit + push + build + deploy, log en logs/sync.log
npm run sync -- --solo-deploy    # salta Aules y git: solo reconstruye y despliega la web
npm run deploy                   # build y despliegue en Pages y Workers
npm run discover                 # lista los cursos matriculados para rellenar data/config.json
npm run sync:aules               # solo los JSON de data/aules/
npm run schedule                 # programa el sync cada 2 h (--quitar, --estado)
npm test                         # tests de los scripts Node

npm run falta -- DWS                                  # falta de hoy
npm run falta -- DWS 2026-10-05 --justificada
npm run falta -- SOS 2026-09-15 --sesiones 2 --nota "Itaca: sin justificar"
npm run falta -- DWS 2026-10-05 --borrar
npm run falta -- DWS --sin-deploy                     # escribe manual.json y no publica

npm run evento -- DIG "Examen Tema 2" 2026-10-14                  # --tipo examen por defecto
npm run evento -- DWS "Entrega del proyecto" 2026-11-20 --tipo entrega
npm run evento -- - "Día no lectivo" 2027-02-26 --tipo festivo    # "-" = sin asignatura
```

Tipos de evento válidos: `examen`, `festivo`, `entrega`, `info`, `otro`. Con código el tipo por defecto es `examen`; sin código, `otro`. Las sesiones de una falta se deducen del horario del día y del periodo vigente; `--sesiones N` es obligatorio si ese día no hay clase de esa asignatura.

## Reglas

- No edites `data/aules/`: el siguiente sync lo sobrescribe. Lo que sea manual va a `manual.json`.
- Si editas `manual.json` a mano, publica el cambio con `npm run sync -- --solo-deploy`.
- Nunca commitees `.env`. `bedel.config.json` es de la máquina: en el repo plantilla está ignorado.
- No toques `web/wrangler.worker.toml` salvo que el usuario lo pida: `run_worker_first` y el nombre del fichero son deliberados.
- Mantén el JSON con 2 espacios de sangría y respeta el orden por fecha de las listas de `manual.json`.
- Textos en español. Nunca punto medio ni rayas largas (em dash o en dash): usa coma o guion corto "-".

## Estructura del código

- `scripts/sync-aules/` sincronizador con la API de Moodle de Aules (`sync.js`, `lib/`, `test/`).
- `scripts/lib/` lógica testeable: `config.mjs` (`bedel.config.json`), `manual.mjs` (faltas y eventos), `deploy.mjs` (build, Pages, Workers, commit), `sync-cycle.mjs`, `schedule.mjs`, `setup-steps.mjs`, `run.mjs`, `prompt.mjs`.
- `scripts/*.mjs` son las entradas de los comandos npm: parsean argumentos y llaman a `lib/`.
- Web Vue 3 + Vite en `web/`, vistas en `web/src/views/`: `Hoy.vue` (resumen del día y avisos), `Horario.vue` (horario y descarga .ics), `Entregas.vue` (tareas de Aules y plazos manuales), `Material.vue` (recursos de Aules y enlaces), `Avisos.vue` (anuncios con "visto" en localStorage), `Faltas.vue` (porcentajes y margen por módulo).
- Protección por contraseña: `web/functions/` (Pages Functions: `_middleware.js`, `login.js`, `lib/auth.js`) y `web/worker.js` (Worker con static assets), que comparten `lib/auth.js`. Secretos `SITE_PASSWORD` y `SITE_TOKEN` en los dos destinos.

## Tests

`npm test` en la raíz (`node --test` sobre `scripts/**/*.test.mjs`). Tests de la web: `cd web && npm test` (vitest). Los dos tienen que quedar en verde antes de commitear.
