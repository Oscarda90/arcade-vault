# SPEC 03 — Acerca de + formulario de contacto con Resend

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-11-15
> **Objective:** Portar `references/templates/home-about/about.jsx` a `/acerca` y hacer que su formulario de contacto envíe un correo real al equipo vía Resend.

## Por qué existe este spec

SPEC 02 dejó fuera "Acerca de" porque incluye el primer flujo con backend real del proyecto: un formulario que envía correo. Es la primera vez que el repo usa una dependencia de servidor externa (Resend), secretos en variables de entorno y una Server Action, por lo que fija convenciones para specs posteriores.

## Scope

**In:**

- Página `/acerca` con el contenido literal de `about.jsx`: hero ("ACERCA DE ARCADE VAULT", misión, 3 highlights con iconos pixel), divider animado de 24 píxeles, sección "CONTÁCTANOS" con tips y formulario.
- Link "Acerca de" en el nav (desktop y panel móvil), después de "Salón de la Fama", activo en `/acerca` — orden de `nav.jsx`.
- Formulario cliente con campos NOMBRE, CORREO ELECTRÓNICO, MENSAJE, placeholders literales del template.
- Validación cliente literal del template: algún campo vacío (tras trim) → animación `shake`, no se envía. Además `type="email"` nativo y `maxLength` 80 (nombre), 254 (correo), 2000 (mensaje).
- Campo honeypot oculto (`website`), invisible para usuarios y lectores de pantalla.
- Server Action `sendContactMessage` que valida en servidor, descarta honeypot y llama a Resend.
- Correo único al equipo (`CONTACT_TO_EMAIL`) con nombre, correo y mensaje; `replyTo` = correo del usuario; cuerpo en texto plano + HTML simple escapado.
- Estados UI: idle → enviando (botón deshabilitado "▶ TRANSMITIENDO…") → éxito (terminal verde literal del template) o error (terminal estilo VAULT-OS con líneas `[ERR]` y botón "REINTENTAR" que conserva los datos).
- "ENVIAR OTRO MENSAJE" resetea a formulario vacío (como el template).
- Error controlado si faltan `RESEND_API_KEY` o `CONTACT_TO_EMAIL`: la action devuelve error, `console.error` en servidor, el build no falla.
- `.env.example` versionado con las tres variables; `.gitignore` ajustado con `!.env.example`.
- CSS del bloque `/* ===== ABOUT PAGE ===== */` del template (incluye `.terminal-success`, `.shake`, `.btn.press`, textarea) añadido a `app/globals.css`, más estilos del terminal de error y del honeypot.
- Animación `.reveal` reutilizando `components/home/reveal.tsx` (SPEC 02), respetando `prefers-reduced-motion` (incluye `.div-pixels span` sin parpadeo).
- Dependencia nueva: `resend`.

**Out of scope (for future specs):**

- Correo de acuse al usuario.
- Dominio propio verificado en Resend (se usa `onboarding@resend.dev` por defecto).
- Persistir mensajes en base de datos o panel de administración.
- Rate limiting, CAPTCHA o Turnstile.
- Mensajes de error por campo (fuera de la terminal de error).
- Plantillas React Email.
- Tests automatizados (no hay test runner configurado).

## Data model

```ts
// lib/contact.ts
export const CONTACT_LIMITS = { name: 80, email: 254, msg: 2000 } as const;

export type ContactInput = { name: string; email: string; msg: string };

export type ContactErrorCode = 'invalid' | 'config' | 'send';

export type ContactResult =
  | { ok: true; name: string } // name ya trimmeado, para "GRACIAS, {NAME}."
  | { ok: false; error: ContactErrorCode };

// Valida y normaliza (trim). null si inválido.
export function parseContact(raw: Record<string, unknown>): ContactInput | null;
```

Reglas de `parseContact`:

- `name`, `email`, `msg`: string, no vacíos tras `trim`, longitud ≤ `CONTACT_LIMITS`.
- `email`: regex simple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

Variables de entorno (servidor, nunca `NEXT_PUBLIC_`):

| Variable             | Obligatoria | Default                                |
| -------------------- | ----------- | -------------------------------------- |
| `RESEND_API_KEY`     | Sí          | —                                      |
| `CONTACT_TO_EMAIL`   | Sí          | —                                      |
| `CONTACT_FROM_EMAIL` | No          | `Arcade Vault <onboarding@resend.dev>` |

Correo enviado:

- `subject`: `[Arcade Vault] Nuevo mensaje de {name}`
- `text`: `Nombre: …\nCorreo: …\n\n{msg}`
- `html`: mismo contenido con `name`/`email`/`msg` escapados (`& < > " '`), saltos de línea → `<br>`, estilo inline mínimo (fondo oscuro, fuente monoespaciada).
- `replyTo`: `email` del usuario.

Mapeo de errores a la terminal de error:

| `error`   | Línea `[ERR]` mostrada                      |
| --------- | ------------------------------------------- |
| `invalid` | `[ERR] Datos inválidos. Revisa los campos.` |
| `config`  | `[ERR] Servidor de correo no configurado.`  |
| `send`    | `[ERR] Fallo en la transmisión. Reintenta.` |

Honeypot relleno → la action responde `{ ok: true, name }` sin llamar a Resend.

## Estructura de archivos

```
app/
  acerca/
    page.tsx               # NUEVO: server component; hero, divider, intro de contacto, <ContactForm/>, <Reveal/>
    actions.ts             # NUEVO: "use server"; sendContactMessage(input) → ContactResult
  globals.css              # MODIFICA: + bloque ABOUT PAGE + terminal error + honeypot + reduced-motion
components/
  nav.tsx                  # MODIFICA: sección "acerca" + link en desktop y móvil
  about/
    highlight-icon.tsx     # NUEVO: server; SVG HEART/BROWSER/PLANT
    contact-form.tsx       # NUEVO: "use client"; estados idle/sending/success/error
lib/
  contact.ts               # NUEVO: tipos, límites, parseContact, escapeHtml
.env.example               # NUEVO
.gitignore                 # MODIFICA: !.env.example
package.json               # MODIFICA: + resend
```

## Implementation plan

1. `npm install resend`. Crear `.env.example` con `RESEND_API_KEY=`, `CONTACT_TO_EMAIL=`, `CONTACT_FROM_EMAIL=` y comentarios; añadir `!.env.example` a `.gitignore`. Verificar: `git status` muestra `.env.example` como nuevo.
2. Crear `lib/contact.ts` (tipos, `CONTACT_LIMITS`, `parseContact`, `escapeHtml`). Verificar: `npm run build` pasa.
3. Crear `app/acerca/actions.ts`: `"use server"`; descarta honeypot; `parseContact` → `invalid`; faltan env → `console.error` + `config`; `new Resend(key).emails.send(...)` dentro de `try`; si lanza o devuelve `error` → `console.error` + `send`; si no → `{ ok: true, name }`. Instanciar Resend dentro de la función (no a nivel módulo) para no romper el build sin key. Consultar `node_modules/next/dist/docs/01-app/` sobre Server Actions y `cacheComponents` antes de escribirla.
4. Portar a `app/globals.css` el bloque `/* ===== ABOUT PAGE ===== */` de `references/templates/home-about/styles.css` hasta `.terminal-success` y sus hijos. `grep` cada selector antes de pegar (`.kicker`, `.field`, `.btn.press`, `@keyframes shake`, `pxblink`) y fusionar si ya existe. Añadir `.terminal-error` (variante de `.terminal-success` con borde/`box-shadow` `var(--magenta)` o rojo existente), `.hp-field` (oculto fuera de pantalla) y en `prefers-reduced-motion` desactivar `.div-pixels span` y `.contact-form.shake`.
5. Crear `components/about/highlight-icon.tsx` con los 3 SVG del template.
6. Crear `components/about/contact-form.tsx`: estado `form`, `status: "idle" | "sending" | "success" | "error"`, `error`, `sentName`, `shake`. Submit: vacío → shake 400ms; si no → `sending`, `await sendContactMessage(...)` dentro de `startTransition`, luego `success` o `error`. Honeypot: `<input name="website" tabIndex={-1} autoComplete="off" aria-hidden>` dentro de `.hp-field`. Terminal éxito: literal del template con `GRACIAS, {NAME}.` en mayúsculas. Terminal error: misma barra VAULT-OS, líneas `[OK] Conectando con servidor…`, la línea `[ERR]` de la tabla, botón ghost "REINTENTAR" → vuelve a `idle` sin vaciar `form`.
7. Crear `app/acerca/page.tsx` componiendo hero, highlights (con `transitionDelay` `i*80ms`), divider (24 spans con `animationDelay` `i*80ms`), intro de contacto y `<ContactForm/>`, más `<Reveal/>` de SPEC 02. Añadir `metadata` (`title: "Acerca de — Arcade Vault"`). Verificar: `/acerca` renderiza.
8. `components/nav.tsx`: añadir `"acerca"` a `Section` y `sectionOf` (`pathname.startsWith("/acerca")`); link "Acerca de" después de "Salón de la Fama" en desktop y panel móvil.
9. Prueba real: con `.env.local` válido, enviar el formulario y confirmar recepción en `CONTACT_TO_EMAIL`; responder desde el cliente de correo y confirmar que va al correo del usuario.
10. Pasada de fidelidad visual comparando `/acerca` con `references/templates/home-about/arcade-vault-standalone.html` (vista About) a 1440px y 375px. Seguir `/frontend-design` según `CLAUDE.md`.

## Acceptance criteria

- [ ] `npm run build` termina sin errores, con y sin `.env.local`.
- [ ] `npm run lint` termina sin errores.
- [ ] `/acerca` muestra "ACERCA DE ARCADE VAULT", el párrafo de misión literal y 3 highlights con iconos.
- [ ] El divider muestra 24 píxeles animados.
- [ ] La sección contacto muestra "CONTÁCTANOS", el texto intro y los 3 tips con LEDs verde/amarillo/magenta.
- [ ] Nav: "Acerca de" aparece tras "Salón de la Fama" en desktop y panel móvil, y está activo solo en `/acerca`.
- [ ] Enviar con algún campo vacío (o solo espacios) dispara `shake` y no hace petición de red.
- [ ] Inputs con `maxLength` 80 / 254 / 2000.
- [ ] Durante el envío el botón muestra "TRANSMITIENDO…" y está deshabilitado (doble click no envía dos correos).
- [ ] Con env válido, un envío llega a `CONTACT_TO_EMAIL` con asunto `[Arcade Vault] Nuevo mensaje de {name}` y `Reply-To` = correo del usuario.
- [ ] Tras éxito se ve la terminal verde con "GRACIAS, {NOMBRE EN MAYÚSCULAS}."; "ENVIAR OTRO MENSAJE" vuelve al formulario vacío.
- [ ] Un mensaje con `<script>alert(1)</script>` llega escapado en el HTML del correo.
- [ ] Sin `RESEND_API_KEY`, el envío muestra la terminal de error con "Servidor de correo no configurado." y el servidor loguea el error.
- [ ] Con `RESEND_API_KEY` inválida, se muestra "Fallo en la transmisión. Reintenta."
- [ ] "REINTENTAR" vuelve al formulario con los datos intactos.
- [ ] Con el honeypot `website` relleno (vía DevTools), se muestra éxito y no se envía correo.
- [ ] La API key no aparece en el bundle del cliente (`grep` de `RESEND_API_KEY` y del valor en `.next/static` sin resultados).
- [ ] `.env.example` está versionado; `.env.local` no.
- [ ] A 375px `/acerca` no tiene scroll horizontal; `contact-grid` pasa a 1 columna bajo 900px.
- [ ] Con `prefers-reduced-motion: reduce` todo el contenido es visible al cargar y los píxeles del divider no parpadean.
- [ ] Sin errores de hidratación en consola en `/acerca`.

## Decisions

- **Yes:** ruta `/acerca`. Español y corta, coherente con `/salon` y `/biblioteca`.
- **No:** `/about` (rompe convención) ni `/acerca-de` (más larga).
- **Yes:** Server Action en `app/acerca/actions.ts`. Sin endpoint público, idiomático en App Router.
- **No:** Route Handler `/api/contacto`. Sin otros clientes que lo necesiten.
- **Yes:** validación manual sin dependencias, duplicada cliente (vacíos/maxLength) y servidor (autoritativa).
- **No:** Zod. Una dependencia para 3 campos no compensa.
- **Yes:** honeypot como única defensa anti-spam; éxito falso para no dar señal al bot.
- **No:** rate limit en memoria (no fiable en serverless) ni CAPTCHA (fricción y otro servicio).
- **Yes:** remitente configurable por `CONTACT_FROM_EMAIL`, default `onboarding@resend.dev`; `replyTo` al usuario.
- **Yes:** un solo correo al equipo. Sin acuse al usuario (requiere dominio verificado).
- **Yes:** texto plano + HTML string escapado.
- **No:** React Email. Dependencias extra para un correo interno.
- **Yes:** estados enviando y error estilo terminal VAULT-OS. Extiende el lenguaje visual del template, que no los define.
- **No:** error inline bajo el botón.
- **Yes:** shake literal del template para vacíos + `maxLength`; errores de servidor en la terminal.
- **No:** mensajes de error por campo.
- **Yes:** env faltante → error controlado `config`, build no falla.
- **No:** simular éxito en desarrollo. Oculta configuraciones rotas.
- **Yes:** `.env.example` versionado con `!.env.example` en `.gitignore`.
- **Yes:** reutilizar `components/home/reveal.tsx` de SPEC 02.

## Risks

| Risk                                                                                         | Mitigation                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Con `onboarding@resend.dev`, Resend solo entrega al correo dueño de la cuenta                | Documentar en `.env.example` que `CONTACT_TO_EMAIL` debe ser ese correo hasta verificar dominio.             |
| Server Actions / `cacheComponents` con semántica distinta en Next 16.4                       | Leer `node_modules/next/dist/docs/01-app/` antes del paso 3; la página es estática y solo el form es client. |
| `new Resend()` a nivel módulo lanza en build sin key                                         | Instanciar dentro de la action, tras comprobar la env.                                                       |
| `.gitignore` con `.env*` ignora `.env.example`                                               | Añadir `!.env.example` y verificar con `git status`.                                                         |
| Selectores del CSS About colisionan con existentes (`.kicker`, `.field`, `@keyframes shake`) | `grep` cada selector en `globals.css` antes de pegar; fusionar si difiere.                                   |
| Inyección HTML en el correo                                                                  | `escapeHtml` sobre todos los campos de usuario; criterio de aceptación con `<script>`.                       |
| Spam pese al honeypot agota cuota de Resend                                                  | Aceptado para este spec; rate limit/CAPTCHA en spec futuro.                                                  |

## What is **not** in this spec

- Acuse de recibo al usuario.
- Dominio verificado en Resend.
- Persistencia de mensajes / panel admin.
- Rate limiting / CAPTCHA.
- Errores por campo.
- React Email.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
