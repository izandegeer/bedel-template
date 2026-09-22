# Bedel

Hub de logística del curso para 2º DAW tarde del IES Mutxamel: el horario, las entregas de Aules, el material de clase, los avisos, los exámenes y tus faltas de asistencia, todo en una web tuya protegida por contraseña. Un sincronizador lee tu Aules cada 2 horas y publica los datos; tú solo apuntas faltas y exámenes con dos comandos.

Los datos viven en tu repo y en tu cuenta de Cloudflare. Nadie más los ve.

## Requisitos

- Node 22 o superior
- git
- Una cuenta gratuita de Cloudflare
- Tu usuario y contraseña de Aules
- Mac o Windows

## Ponerlo en marcha

1. Pulsa **"Use this template"** arriba en GitHub y crea tu repo como **privado**. No hagas fork: un fork sería público y tus faltas también.
2. Clónalo en tu ordenador y entra en la carpeta:
   ```bash
   git clone <la URL de tu repo> bedel
   cd bedel
   ```
3. Instala las dependencias de la web:
   ```bash
   cd web && npm install && cd ..
   ```
4. Ejecuta el instalador:
   ```bash
   npm run setup
   ```
   Te va a preguntar, por este orden:
   - El nombre que quieres para tu proyecto de Cloudflare.
   - Tu usuario y contraseña de Aules. **No se guardan**: se usan una vez para pedirle a Aules un token de acceso, y solo el token queda en `.env` (que no se sube al repo).
   - El login de Cloudflare, si no tenías sesión: se abre el navegador y autorizas wrangler.
   - La contraseña con la que quieres entrar en tu web, dos veces.
   - Si quieres programar la sincronización cada 2 horas.

   Después crea el proyecto, guarda los secretos, construye la web y la despliega.
5. Abre la URL que imprime al final e introduce la contraseña de la web.

### Por qué hay dos URLs

El instalador imprime dos direcciones con el mismo contenido, una `*.pages.dev` y otra `*.workers.dev`. La red del instituto bloquea las IPs de `pages.dev`, así que desde clase hay que usar la de `workers.dev`. Fuera del instituto funcionan las dos. Guarda las dos en el móvil.

## Uso diario

La sincronización con Aules corre sola cada 2 horas si dijiste que sí en el paso 4: baja entregas, avisos y material, lo commitea y vuelve a publicar la web. Para forzarla, `npm run sync`.

Apuntar una falta:

```bash
npm run falta -- DWS                                   # falta de hoy en esa asignatura
npm run falta -- DWS 2026-10-05 --justificada
npm run falta -- SOS 2026-09-15 --sesiones 2 --nota "Sin justificar"
npm run falta -- DWS 2026-10-05 --borrar
```

Apuntar un examen, una entrega o un festivo:

```bash
npm run evento -- DIG "Examen Tema 2" 2026-10-14
npm run evento -- DWS "Entrega del proyecto" 2026-11-20 --tipo entrega
npm run evento -- - "Día no lectivo" 2027-02-26 --tipo festivo
```

Los dos comandos escriben el cambio, lo suben al repo y publican la web. Con `--sin-deploy` solo lo escriben.

Otros comandos: `npm run sync -- --solo-deploy` (solo reconstruye y publica), `npm run deploy`, `npm run schedule -- --estado`, `npm test`.

### Con una IA

Si usas Claude Code, Codex, Copilot o Gemini CLI, no hace falta que te aprendas los comandos: abre el repo con el asistente y pídeselo en lenguaje natural ("apunta una falta de DWS del martes pasado", "añade el examen de DIW del 14 de octubre", "actualiza mi horario"). En la raíz hay un `AGENTS.md` que le explica qué es cada fichero, qué comandos existen y qué no debe tocar, así que sabe hacerlo sin que le expliques nada.

## Datos

`data/` ya viene con el horario, los profesores, el calendario escolar 2026/27, las horas oficiales de cada módulo y el mapeo de cursos de Aules de 2º DAW tarde. Si tu grupo es el mismo, no tienes que tocar nada.

Lo tuyo va a `data/manual.json`: `absences` (faltas), `events` (exámenes, festivos, entregas), `deadlines` (plazos que no están en Aules), `notes` y `done`. Los comandos `falta` y `evento` escriben ahí. `data/aules/` lo genera el sincronizador: no lo edites, se sobrescribe.

## Si algo falla

- **El token de Aules ha caducado** (el sync deja de traer datos o falla la autenticación): vuelve a ejecutar `npm run setup`, pide un token nuevo y sigue.
- **"Aules devolvió N de M cursos"**: tus cursos matriculados no coinciden con `data/config.json`. Ejecuta `npm run discover` para ver la lista de ids y nombres de tus cursos, y corrige el mapeo id a código en `data/config.json`. Mientras no coincidan, el sync no escribe nada, a propósito: así no borra datos buenos.
- **wrangler dice que no hay sesión**: `npx -y wrangler@latest login` y vuelve a ejecutar `npm run setup`.
- **La web no carga en el instituto**: es `pages.dev`, que está bloqueado en la red del centro. Usa la URL de `workers.dev`.
- **La tarea programada no corre**:
  - Mac: `npm run schedule -- --estado`, o `launchctl list | grep bedel`. Forzarla: `launchctl kickstart gui/$(id -u)/com.bedel.sync`.
  - Windows: `npm run schedule -- --estado`, o `schtasks /Query /TN "Bedel Sync"`.
  - Si no aparece, `npm run schedule` la instala otra vez. El registro está en `logs/sync.log`.
- **Cualquier otra cosa**: `npm run setup` se puede volver a ejecutar tantas veces como quieras. Cada paso detecta lo que ya estaba hecho y no lo repite.

## Privacidad

- Tu repo debe ser **privado**. Contiene tus faltas y tus entregas.
- `.env` (el token de Aules) y `bedel.config.json` (la configuración de tu máquina) están en `.gitignore` y no se suben.
- La web está detrás de contraseña: sin ella no se sirve ni el HTML ni los JSON de datos.
- Los datos solo salen de tu ordenador hacia tu propia cuenta de Cloudflare.

## Licencia

MIT. Autor: Izan de Geer.
