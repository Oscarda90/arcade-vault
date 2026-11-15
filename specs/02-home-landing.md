# SPEC 02 — Home (landing) de Arcade Vault

> **Status:** Implementado
> **Depends on:** SPEC 01
> **Date:** 2026-11-15
> **Objective:** Portar la landing de `references/templates/home-about/home.jsx` a `/` y mover la Biblioteca a `/biblioteca`.

## Por qué existe este spec

SPEC 01 dejó la Biblioteca como página de entrada. El nuevo template `home-about/` introduce una landing de marketing (hero, features, preview de juegos, stats, actividad, precios, CTA final) que pasa a ser la entrada. Esto obliga a reubicar la Biblioteca y revisar todos los links que hoy asumen `/` = Biblioteca.

## Scope

**In:**

- Nueva landing en `/` con las 7 secciones de `home.jsx`: hero con silhouettes flotantes, "¿POR QUÉ ARCADE VAULT?", "JUEGOS DISPONIBLES AHORA", stats, "ACTIVIDAD EN VIVO", "PRECIOS" + FAQ, CTA final.
- Textos y mocks copiados literalmente del template (incluye "12+ JUEGOS", ticker y top jugadores estáticos).
- Mini-rail con `GAMES.slice(0, 6)` desde `lib/games.ts`; cada mini-card navega a `/juegos/<id>`.
- Animación `.reveal` por IntersectionObserver, desactivada con `prefers-reduced-motion` (secciones visibles sin transición, silhouettes sin flotar).
- Biblioteca movida de `/` a `/biblioteca` sin cambios funcionales.
- Nav: añadir link "Inicio" (activo en `/`); "Biblioteca" activo en `/biblioteca` y `/juegos/*`. Desktop y panel móvil.
- CTAs "✦ CREAR CUENTA" y "EMPEZAR GRATIS →" abren `/auth?modo=registro` con la tab "Crear cuenta" seleccionada.
- Actualización de links internos (ver tabla en Implementation plan).
- CSS de las secciones HOME PAGE, ACTIVITY y PRICING del template añadido a `app/globals.css`.

**Out of scope (for future specs):**

- Página "Acerca de" (`about.jsx`), formulario de contacto y su link en el nav.
- CSS de GAMEPAD y "Theme variants" del template.
- Ticker / top jugadores / stats con datos reales (siguen siendo mocks estáticos).
- Cambios en el contenido de la Biblioteca, Detalle, Reproductor, Auth o Salón más allá de sus links.
- Tests automatizados (no hay test runner configurado).

## Data model

Este feature no introduce estructuras de datos nuevas. Reutiliza `GAMES` y `Game` de `lib/games.ts` (SPEC 01).

Los mocks del ticker, top jugadores, features, stats y FAQ viven como constantes locales en `components/home/*.tsx`, sin exportarse a `lib/`:

```ts
// components/home/live-activity.tsx (local)
const TICKER: { p: string; g: string; s: number; t: string; c: GameColor }[]; // 7 filas del template
const TOP: { r: number; p: string; s: number }[]; // 5 filas del template
```

Parámetro de URL nuevo:

- `/auth?modo=registro` → tab inicial "Crear cuenta". Cualquier otro valor o ausencia → "Iniciar sesión".

Convenciones:

- Números con `toLocaleString("es-ES")`, como SPEC 01.
- Ancho de barra en top jugadores: `100 - i * 16` %.

## Estructura de archivos

```
app/
  page.tsx                   # REEMPLAZA: Home (landing), server component
  biblioteca/page.tsx        # NUEVO: <Library/> (antes en app/page.tsx)
  auth/page.tsx              # MODIFICA: <Suspense> alrededor de <AuthForm/> si useSearchParams lo exige
  not-found.tsx              # sin cambios (sigue a "/")
  juegos/[id]/page.tsx       # MODIFICA: link volver → /biblioteca
  globals.css                # MODIFICA: + estilos home/activity/pricing
components/
  nav.tsx                    # MODIFICA: link Inicio + sectionOf
  auth-form.tsx              # MODIFICA: tab inicial desde ?modo=registro; redirect → /biblioteca
  game-player.tsx            # MODIFICA: link → /biblioteca
  hall-of-fame.tsx           # MODIFICA: link → /biblioteca
  home/
    reveal.tsx               # client: IntersectionObserver sobre .reveal
    floating-silhouettes.tsx # server: 8 SVG pixel
    feature-icon.tsx         # server: GAMEPAD/FREE/TROPHY/ROCKET
    mini-card.tsx            # server: Link a /juegos/<id>
    live-activity.tsx        # server: ticker + top jugadores
    pricing.tsx              # server: price-card + FAQ
```

Server Components por defecto. `"use client"` solo en `components/home/reveal.tsx` (y los ya existentes de SPEC 01).

## Implementation plan

1. Crear `app/biblioteca/page.tsx` con `<Library/>` (mover contenido actual de `app/page.tsx`). Dejar `app/page.tsx` temporalmente igual. Verificar: `/biblioteca` muestra la Biblioteca.
2. Actualizar links internos según tabla. Verificar: `npm run build` pasa.

   | Archivo                                   | Destino nuevo    |
   | ----------------------------------------- | ---------------- |
   | `components/nav.tsx` logo                 | `/` (sin cambio) |
   | `components/nav.tsx` link Biblioteca      | `/biblioteca`    |
   | `app/juegos/[id]/page.tsx` volver         | `/biblioteca`    |
   | `components/game-player.tsx`              | `/biblioteca`    |
   | `components/hall-of-fame.tsx`             | `/biblioteca`    |
   | `components/auth-form.tsx` login/invitado | `/biblioteca`    |
   | `app/not-found.tsx` "VOLVER AL VAULT"     | `/` (sin cambio) |

3. Nav: añadir sección `"inicio"` a `sectionOf` (`pathname === "/"`), `"biblioteca"` para `/biblioteca` y `/juegos/*`. Añadir link "Inicio" antes de "Biblioteca" en desktop y panel móvil, en el orden del template `nav.jsx` (sin "Acerca de").
4. Portar a `app/globals.css` los bloques `/* ===== HOME PAGE ===== */`, `/* ===== ACTIVITY ... ===== */` y `/* ===== PRICING ===== */` de `references/templates/home-about/styles.css`. Reusar tokens existentes; añadir a `:root`/`@theme` solo variables que falten (p. ej. `--gold` si no existe). Añadir bloque `@media (prefers-reduced-motion: reduce)` que fuerza `.reveal` visible sin transición y quita la animación de `.home-silos .silo`.
5. Crear `components/home/floating-silhouettes.tsx` y `components/home/feature-icon.tsx` (SVG del template, `strokeWidth` en JSX).
6. Crear `components/home/mini-card.tsx`, `live-activity.tsx` y `pricing.tsx` con los textos literales del template. "VER SALÓN →" es `Link` a `/salon`.
7. Crear `components/home/reveal.tsx`: client component que, al montar, observa los `.reveal` del documento (threshold 0.12) y añade `in`; con reduced-motion añade `in` inmediatamente. Se renderiza una vez dentro de la Home.
8. Reemplazar `app/page.tsx` por la landing completa componiendo los anteriores. CTAs: "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →", "INSERTAR MONEDA →" → `/biblioteca`; "CREAR CUENTA", "EMPEZAR GRATIS →" → `/auth?modo=registro`. Todos como `Link` con clases `btn`.
9. `components/auth-form.tsx`: tab inicial `"up"` si `useSearchParams().get("modo") === "registro"`. Si el build exige `<Suspense>` por `cacheComponents`, envolver `<AuthForm/>` en `app/auth/page.tsx`.
10. Pasada de fidelidad visual: comparar `/` con `references/templates/home-about/arcade-vault-standalone.html` en navegador a 1440px y 375px. Seguir `/frontend-design` según `CLAUDE.md`.

## Acceptance criteria

- [ ] `npm run build` termina sin errores.
- [ ] `npm run lint` termina sin errores.
- [ ] `/` muestra el hero con "EL ARCADE / CLÁSICO ESTÁ / DE VUELTA", 8 silhouettes y 2 CTAs.
- [ ] `/` muestra las secciones `// 01` a `// 04`, la franja de stats y "¿LISTO PARA JUGAR?".
- [ ] La sección `// 02` muestra 6 mini-cards; click en una navega a `/juegos/<id>`.
- [ ] El ticker muestra 7 filas y el top jugadores 5 filas con #01–#03 resaltados.
- [ ] "EXPLORAR JUEGOS", "VER TODOS LOS JUEGOS →" e "INSERTAR MONEDA →" navegan a `/biblioteca`.
- [ ] "CREAR CUENTA" y "EMPEZAR GRATIS →" abren `/auth` con la tab "CREAR CUENTA" activa y el campo de correo visible.
- [ ] `/auth` sin parámetro abre en "INICIAR SESIÓN".
- [ ] "VER SALÓN →" navega a `/salon`.
- [ ] Las secciones con `.reveal` aparecen al hacer scroll (clase `in` añadida).
- [ ] Con `prefers-reduced-motion: reduce` emulado, todas las secciones son visibles al cargar y las silhouettes no se mueven.
- [ ] `/biblioteca` muestra hero, buscador, 5 chips y 8 tarjetas (criterios de Biblioteca de SPEC 01 siguen cumpliéndose).
- [ ] Nav: "Inicio" activo en `/`; "Biblioteca" activo en `/biblioteca` y `/juegos/<id>`; "Salón de la Fama" activo en `/salon`.
- [ ] El panel móvil incluye "Inicio" y no incluye "Acerca de".
- [ ] Volver desde Detalle, Reproductor y Salón navega a `/biblioteca`.
- [ ] Login y "Jugar como invitado" redirigen a `/biblioteca`.
- [ ] La 404 "VOLVER AL VAULT" y el logo navegan a `/`.
- [ ] A 375px de ancho `/` no tiene scroll horizontal y el mini-rail muestra 2 columnas.
- [ ] Sin errores de hidratación en consola en `/`, `/biblioteca` y `/auth`.

## Decisions

- **Yes:** Home en `/`, Biblioteca en `/biblioteca`. La landing es la entrada; la ruta coincide con el label del nav.
- **No:** Biblioteca en `/juegos`. Coherente como índice, pero se elige el nombre visible del nav.
- **No:** landing en `/inicio`. La landing debe ser la entrada.
- **Yes:** textos y mocks literales del template. Máxima fidelidad, mínima interpretación; datos reales van en otro spec.
- **No:** adaptar a "8 JUEGOS" y ticker derivado de `GAMES`. Descartado por ahora.
- **Yes:** "Acerca de" fuera, sin link. Tiene formulario de contacto; merece su propio spec.
- **No:** link a página placeholder "PRÓXIMAMENTE".
- **Yes:** `/auth?modo=registro` abre la tab Crear cuenta. Cumple la promesa del CTA con un cambio pequeño.
- **Yes:** links mixtos: "volver/ver juegos" → `/biblioteca`; logo y 404 → `/`.
- **Yes:** CSS añadido a `app/globals.css`. Consistente con SPEC 01.
- **No:** `app/home.css` separado.
- **Yes:** respetar `prefers-reduced-motion`. Contenido nunca queda oculto por animación.
- **No:** portar CSS de GAMEPAD y Theme variants. No los usa `home.jsx`.
- **Yes:** Home como Server Component; solo `reveal.tsx` es client. Menos JS en la landing.

## Risks

| Risk                                                                                    | Mitigation                                                                                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `useSearchParams` en `auth-form.tsx` exige `<Suspense>` con `cacheComponents`           | Revisar error de build y envolver `<AuthForm/>` en `<Suspense>` en `app/auth/page.tsx`; consultar `node_modules/next/dist/docs/01-app/`. |
| `.reveal` deja secciones invisibles si el observer no corre (JS falla o hidrata tarde)  | Reduced-motion fuerza visibilidad; `reveal.tsx` añade `in` a elementos ya en viewport al montar.                                         |
| Selectores del CSS nuevo colisionan con clases de SPEC 01 (p. ej. `.kicker`, `.btn.xl`) | Antes de pegar, `grep` cada selector en `globals.css`; fusionar o renombrar si difiere.                                                  |
| Links olvidados apuntando a `/` asumiendo Biblioteca                                    | `grep -rn 'href="/"\|push("/")' app components` tras el paso 2 y comparar con la tabla.                                                  |

## What is **not** in this spec

- Página "Acerca de" y formulario de contacto.
- CSS de GAMEPAD / Theme variants.
- Stats, ticker y top jugadores con datos reales.
- Cambios de contenido en otras pantallas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
