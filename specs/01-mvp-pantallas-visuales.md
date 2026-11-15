# SPEC 01 — MVP visual de Arcade Vault

> **Status:** Aprobado
> **Depends on:** —
> **Date:** 2026-11-08
> **Objective:** Portar a Next.js App Router las cinco pantallas de `references/templates/` (Biblioteca, Detalle, Reproductor, Auth, Salón de la Fama) con datos mock y sin lógica de juego real.

## Por qué existe este spec

El repo es todavía el scaffold de `create-next-app`. Los estilos y fuentes del template ya están portados (`app/globals.css`, `app/layout.tsx`). Falta la estructura de pantallas y navegación que servirá de base para los specs de juegos y backend.

## Scope

**In:**

- Rutas App Router reales: `/`, `/juegos/[id]`, `/juegos/[id]/jugar`, `/auth`, `/salon`.
- Nav (desktop + panel móvil con hamburguesa) y footer compartidos en `app/layout.tsx`.
- Biblioteca: hero, búsqueda por nombre, chips de categoría, grid de tarjetas con efecto tilt, estado "NO HAY RESULTADOS".
- Detalle: portada, tags, descripción, stat-strip, acciones, leaderboard mock de 10 filas.
- Reproductor: HUD, arena CRT placeholder animada, contador de puntaje simulado, pausa, modal FIN con guardar puntuación.
- Auth: tabs Iniciar sesión / Crear cuenta, login mock sin validación, "Jugar como invitado".
- Salón de la Fama: tabs por juego, podio top 3, tabla de 12 filas, fila "tu mejor marca" si hay usuario.
- Sesión mock (`av_user`) y puntuaciones guardadas (`av_scores`) en localStorage, como el template.
- Página 404 temática para ids de juego inexistentes y rutas desconocidas.
- Limpieza del scaffold: reemplazar `app/page.tsx` y borrar SVGs de ejemplo de `public/`.

**Out of scope (for future specs):**

- Cualquier juego real (lógica, canvas, controles, colisiones).
- Autenticación real, validación de formularios, OAuth Google/GitHub.
- Backend, base de datos, API routes.
- Leaderboards reales: Salón y Detalle siguen mostrando datos sembrados, no leen `av_scores`.
- Sistema de créditos funcional.
- Menú de cuenta desplegable (el botón de usuario solo cierra sesión).
- Tests automatizados (no hay test runner configurado).

## Data model

Todo vive en `lib/games.ts`, tipado a partir de `references/templates/data.jsx`.

```ts
export type GameCategory = 'ARCADE' | 'PUZZLE' | 'SHOOTER' | 'VERSUS';
export type GameColor = 'cyan' | 'magenta' | 'yellow' | 'green';

export interface Game {
  id: string; // slug usado en /juegos/[id]
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string; // clase CSS en globals.css, ej. "cover-bricks"
  color: GameColor;
  best: number;
  plays: string; // ya formateado, ej. "12.4K"
}

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string;
} // date "DD/MM/2026"

export const GAMES: Game[]; // los 8 juegos del template, mismos datos
export const CATS: ('TODOS' | GameCategory)[];
export function getGame(id: string): Game | undefined;
export function seededScores(seed: number, count?: number): ScoreRow[]; // determinista, idéntica al template
```

Sesión en `lib/session.tsx` (Client Component, React context):

```ts
interface User {
  name: string;
} // mayúsculas, máx. 10 chars, default "PLAYER1"
interface SavedScore {
  game: string;
  score: number;
  name: string;
  at: number;
}

// useSession(): { user: User | null; login(u: User | null): void; logout(): void; saveScore(e: Omit<SavedScore, "at">): void }
```

Claves localStorage (sin versionado, idénticas al template):

- `av_user` → `User | null` serializado.
- `av_scores` → `SavedScore[]` serializado (append).

Convenciones:

- Números formateados con `toLocaleString("es-ES")`.
- Seeds: Detalle usa `id.length * 17 + 3` con 10 filas; Salón usa `id.length * 23 + 7` con 12 filas.

## Estructura de archivos

```
app/
  layout.tsx                 # + SessionProvider, <Nav/>, <main className="av-main">, footer
  page.tsx                   # Biblioteca
  not-found.tsx              # 404 temática
  auth/page.tsx
  salon/page.tsx
  juegos/[id]/page.tsx       # Detalle
  juegos/[id]/jugar/page.tsx # Reproductor
components/
  nav.tsx                    # client
  library.tsx                # client: búsqueda + chips + grid
  game-card.tsx              # client: tilt
  leaderboard.tsx            # server
  game-player.tsx            # client: simulación + modal
  auth-form.tsx              # client
  hall-of-fame.tsx           # client: tabs
lib/
  games.ts
  session.tsx
```

Server Components por defecto. `"use client"` solo en los componentes marcados.

## Implementation plan

1. Crear `lib/games.ts` con tipos, `GAMES`, `CATS`, `getGame` y `seededScores`. Borrar `public/{file,globe,next,vercel,window}.svg`. Verificar: `npm run build` pasa.
2. Crear `lib/session.tsx` (provider + `useSession`, lectura de localStorage vía `useSyncExternalStore`). Envolver `children` en `app/layout.tsx`.
3. Crear `components/nav.tsx` (links con `next/link`, activo por `usePathname`: Biblioteca activo en `/` y `/juegos/*`). Añadir Nav y footer a `app/layout.tsx`. Verificar: nav visible y panel móvil abre/cierra a <840px.
4. Crear `components/game-card.tsx` y `components/library.tsx`. Reemplazar `app/page.tsx` por la Biblioteca. Verificar: filtro por texto y categoría funciona y muestra estado vacío.
5. Crear `app/not-found.tsx` con estilo arcade y botón "VOLVER AL VAULT".
6. Crear `components/leaderboard.tsx` y `app/juegos/[id]/page.tsx` (`params` como Promise, `generateStaticParams` desde `GAMES`, `notFound()` si no existe). Verificar: click en tarjeta navega al detalle.
7. Crear `components/game-player.tsx` (contador cada 220 ms, subida de nivel, pausa, FIN, modal, guardar en `av_scores`, reiniciar) y `app/juegos/[id]/jugar/page.tsx` con `notFound()`.
8. Crear `components/auth-form.tsx` y `app/auth/page.tsx`. Login → guarda `av_user` y navega a `/`. Invitado → `login(null)` y navega a `/`.
9. Crear `components/hall-of-fame.tsx` y `app/salon/page.tsx` (podio, tabla con `animationDelay`, fila "tu mejor marca" si hay usuario).
10. Pasada de fidelidad visual: comparar cada pantalla con `references/templates/Arcade Vault.html` abierto en navegador, mover inline styles del template a utilidades Tailwind/tokens donde aplique. Seguir `/frontend-design` según `CLAUDE.md`.

## Acceptance criteria

- [ ] `npm run build` termina sin errores.
- [ ] `npm run lint` termina sin errores.
- [ ] `/` muestra hero, buscador, 5 chips y 8 tarjetas.
- [ ] Escribir "ser" en el buscador deja solo SERPENTINA.
- [ ] Chip PUZZLE deja solo CAÍDA; búsqueda sin coincidencias muestra "NO HAY RESULTADOS".
- [ ] Click en una tarjeta o en su botón JUGAR navega a `/juegos/<id>`.
- [ ] `/juegos/<id>` muestra portada, título, stat-strip y leaderboard de 10 filas con top 3 resaltado.
- [ ] `/juegos/xyz` y `/juegos/xyz/jugar` muestran la 404 temática.
- [ ] "JUGAR AHORA" navega a `/juegos/<id>/jugar`; el puntaje sube solo.
- [ ] PAUSA detiene el puntaje y muestra overlay "EN PAUSA"; REANUDAR lo continúa.
- [ ] FIN abre el modal; GUARDAR PUNTUACIÓN añade una entrada a `av_scores` y muestra "PUNTUACIÓN GUARDADA\_".
- [ ] JUGAR DE NUEVO reinicia puntaje a 0, vidas a 3 y nivel a 01.
- [ ] Login en `/auth` con usuario "kai" muestra "KAI ▾" en el nav y persiste tras recargar.
- [ ] Tab CREAR CUENTA muestra el campo de correo.
- [ ] Click en el botón de usuario cierra sesión y borra `av_user`.
- [ ] `/salon` muestra tabs de 8 juegos, podio 02-01-03 y tabla de 12 filas; cambiar tab cambia los datos.
- [ ] Con sesión iniciada, `/salon` muestra la fila "TU MEJOR MARCA EN <JUEGO>".
- [ ] Link activo del nav correcto en `/`, `/juegos/<id>`, `/salon`.
- [ ] A 375px de ancho: hamburguesa visible, panel móvil funciona, sin scroll horizontal.
- [ ] Sin errores de hidratación en consola en ninguna ruta.
- [ ] `public/` ya no contiene los SVGs del scaffold.

## Decisions

- **Yes:** rutas reales App Router. URLs compartibles y aprovecha Server Components.
- **No:** SPA con router por hash del template. Desaprovecha Next.
- **Yes:** simular partida en el Reproductor como el template. Permite ver todos los estados visuales sin implementar juego.
- **Yes:** localStorage `av_user` / `av_scores` sin versionado. Mock temporal; se reemplaza en el spec de backend.
- **No:** leer `av_scores` en Salón/Detalle. Eso es leaderboard real, otro spec.
- **Yes:** reutilizar clases ya portadas en `globals.css`. Máxima fidelidad con mínimo trabajo.
- **No:** reescribir todo a Tailwind. Riesgo de desviación visual sin beneficio ahora.
- **Yes:** `notFound()` + `app/not-found.tsx` temática. Mejor que la pantalla vacía del template.
- **Yes:** `components/` y `lib/` en raíz con alias `@/*`.
- **Yes:** botones sociales y contador de créditos decorativos; click en usuario = cerrar sesión. Igual que template.
- **Yes:** borrar restos del scaffold en `public/`.
- **Yes:** `export const instant = false` en `/juegos/[id]` y `/juegos/[id]/jugar`. Con `partialPrefetching`, leer `params` fuera de `<Suspense>` dispara un aviso en dev; opt-out mantiene el 404 real.
- **No:** envolver en `<Suspense>`. Quita el aviso pero ids inexistentes responden HTTP 200 (soft 404).

## Risks

| Risk                                                                                      | Mitigation                                                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hydration mismatch al leer localStorage en render                                         | Leer `av_user` con `useSyncExternalStore` (`getServerSnapshot` → `null`); primer render siempre como invitado. `useEffect` + `setState` descartado: lo prohíbe la regla `react-hooks/set-state-in-effect`. |
| `cacheComponents` / `params` como Promise cambian semántica de rutas dinámicas            | Consultar `node_modules/next/dist/docs/01-app/` antes del paso 6; usar `generateStaticParams`. |
| `useSearchParams`/`usePathname` en Nav pueden requerir `<Suspense>` con `cacheComponents` | Revisar error de build y envolver Nav en `Suspense` si Next lo exige.                          |
| Diferencias con React 18 del template (`React.Fragment`, `window.*` globals)              | Usar imports ES y fragmentos `<>`; sin globals en `window`.                                    |

## What is **not** in this spec

- Juegos jugables reales.
- Auth real / OAuth / validación.
- Backend y leaderboards reales.
- Créditos funcionales.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
