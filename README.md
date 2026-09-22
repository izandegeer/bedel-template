# Bedel

Hub de logística del curso para 2º DAW tarde del IES Mutxamel: el horario, las entregas de Aules, el material de clase, los avisos, los exámenes y tus faltas de asistencia, todo en una web tuya protegida por contraseña. Un sincronizador lee tu Aules cada 2 horas y publica los datos; tú solo apuntas faltas y exámenes con dos comandos.

Los datos viven en tu repo y en tu cuenta de Cloudflare. Nadie más los ve.

## Dos formas de montarlo

Elige la que te vaya mejor. Las dos acaban en el mismo sitio: tu web con tus datos.

- **Con tu IA** (Claude Code, Codex, Copilot CLI, Gemini CLI o similar): le pegas un mensaje y lo hace ella. Cinco minutos.
- **A mano, paso a paso**: para hacerlo tú sin saber nada de terminal. Quince minutos.

## Opción A: que lo monte tu IA

Necesitas tener instalado un asistente de IA que pueda usar tu terminal (Claude Code, Codex CLI, GitHub Copilot CLI o Gemini CLI) y una cuenta de GitHub.

1. Pulsa **"Use this template"** arriba en esta página, elige **Private** y ponle de nombre `bedel`. No hagas fork: sería público.
2. Abre tu asistente de IA en cualquier carpeta y pégale este mensaje, cambiando `TU_USUARIO` por tu usuario de GitHub:

   ```text
   Clona https://github.com/TU_USUARIO/bedel en una carpeta llamada bedel y móntalo siguiendo su README.md y su AGENTS.md. Es una plantilla que ya conoce mi horario. Comprueba que tengo Node 22 o superior y git, y si me falta algo, instálalo o dime cómo. Ejecuta `npm install` dentro de web/ y luego `npm run setup` desde la raíz. El instalador es interactivo y me va a pedir mi usuario y contraseña de Aules, una contraseña para la web y el login de Cloudflare: avísame cuando llegue cada pregunta para que la responda yo. Al acabar, dime las dos URLs de mi web y guárdalas en el README de mi repo.
   ```

3. Responde a las preguntas cuando el asistente te avise. Tu contraseña de Aules solo se usa una vez para obtener un token; no se guarda.
4. Abre la URL que te dé y entra con la contraseña de la web.

A partir de ahí, pídele las cosas en lenguaje natural: "apunta una falta de DWS de hoy", "añade el examen de DIW del 14 de octubre", "¿qué entregas tengo esta semana?". El fichero `AGENTS.md` le explica todo lo que necesita.

## Opción B: montarlo a mano, paso a paso

Sin miedo: son cinco pasos y en cada uno solo hay que copiar y pegar.

### 0. Lo que necesitas antes

- **Node**: descárgalo de https://nodejs.org (la versión LTS) e instálalo con todo por defecto. Para comprobarlo, abre una terminal y escribe `node -v`: debe salir `v22` o más.
- **git**: en Mac ya viene (si no, la terminal te ofrece instalarlo la primera vez). En Windows, https://git-scm.com/download/win con todo por defecto.
- **Una cuenta de Cloudflare**: gratis en https://dash.cloudflare.com/sign-up. Solo el correo y una contraseña, no pide tarjeta.
- **Tu usuario y contraseña de Aules**.
- **Una terminal**: en Mac, la app Terminal. En Windows, PowerShell (búscalo en el menú Inicio).

### 1. Crea tu copia del repo

Arriba en esta página, pulsa el botón verde **"Use this template"** y luego **"Create a new repository"**. Ponle de nombre `bedel`, marca **Private** y pulsa **Create repository**. No hagas fork: un fork sería público y tus faltas también.

### 2. Descárgalo a tu ordenador

En la página de tu repo nuevo pulsa el botón verde **"Code"** y copia la URL que aparece. En la terminal, escribe esto cambiando la URL por la tuya:

```bash
git clone https://github.com/TU_USUARIO/bedel.git bedel
cd bedel
```

Si te pide usuario y contraseña de GitHub, la contraseña es un token: te lo explica GitHub en https://docs.github.com/es/authentication. Con la app GitHub Desktop te lo ahorras.

### 3. Instala las piezas de la web

```bash
cd web
npm install
cd ..
```

Tarda un minuto y saca muchas líneas. Es normal.

### 4. Ejecuta el instalador

```bash
npm run setup
```

Te va a preguntar, por este orden:

1. **Nombre del proyecto en Cloudflare**: pulsa Enter para dejar `bedel`.
2. **Tu usuario y contraseña de Aules**. La contraseña no se ve mientras la escribes, es normal. **No se guarda**: se usa una vez para pedirle a Aules un token, y solo el token queda en un fichero `.env` que nunca se sube al repo.
3. **Login de Cloudflare**: se abre el navegador, entras con tu cuenta y pulsas "Allow". Vuelve a la terminal.
4. **Contraseña para tu web**, dos veces. Es la que usarás para entrar desde el móvil. Elige una que recuerdes.
5. **¿Programar la sincronización cada 2 horas?**: di que sí. Así la web se actualiza sola con lo que salga en Aules.

Después construye la web y la publica. Al final imprime dos direcciones.

### 5. Abre tu web

Abre en el navegador la URL que acaba en `workers.dev`, pon la contraseña de la web y listo. Guárdala en el móvil como favorito o en la pantalla de inicio.

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
