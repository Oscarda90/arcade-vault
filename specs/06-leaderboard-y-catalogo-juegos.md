# SPEC 06 — Leaderboard real y catálogo de juegos en Supabase

> **Status:** Implementado

> **Depends on:** SPEC 01, SPEC 04, SPEC 05
> **Date:** 2026-11-24
> **Objective:** Mover el catálogo de juegos a la tabla `public.games` y guardar los puntajes de usuarios con sesión en `public.scores`, mostrando leaderboards reales en la ficha `/juegos/[id]` y en el Salón de la Fama.

## Por qué existe este spec

Hoy el catálogo es el array mock `GAMES` en `lib/games.ts`, los leaderboards salen de `seededScores()` y `saveScore` escribe en `localStorage` (`av_scores`). SPEC 04 dejó `public.profiles` listo para esto y SPEC 05 dejó el primer juego real (`rocas`). Este spec fija la convención de **lecturas públicas cacheadas** (`"use cache"` + `cacheTag` con un cliente Supabase sin cookies) e **invalidación tras mutaciones** (`updateTag` en Server Actions), que reutilizarán specs posteriores.

## Scope

**In:**

- Migración `supabase/migrations/<timestamp>_games_scores.sql`: tablas `public.games` y `public.scores`, vistas `public.leaderboard` y `public.game_stats`, RLS, seed con los 8 juegos actuales.
- `public.games` es la fuente de verdad del catálogo; `GAMES`, `getGame`, `seededScores` y `PLAYERS` se eliminan de `lib/games.ts` (quedan tipos y `CATS`).
- Columna `games.playable`: `true` solo para `rocas`. Solo los juegos `playable` aceptan puntajes.
- `best` (mejor global) y `plays` (nº de puntajes guardados) reales, calculados por `public.game_stats`.
- Cliente Supabase sin cookies `lib/supabase/public.ts` para lecturas dentro de `"use cache"`.
- Capa de datos server-only `lib/data/games.ts`: `getGames`, `getGameById`, `getLeaderboard`, `getAllLeaderboards`, con `cacheTag("games")` / `cacheTag("scores")`.
- Server Action `submitScore` en `app/juegos/actions.ts`: valida sesión, juego `playable`, score; inserta; `updateTag("scores")`.
- Ranking: mejor puntaje por usuario y juego; desempate por fecha (el más antiguo gana).
- Ficha `/juegos/[id]`: leaderboard top 10 real, PARTIDAS y MEJOR GLOBAL reales.
- Salón `/salon`: podio + tabla top 12 reales por juego; "TU MEJOR MARCA" con rango real del usuario con sesión.
- `/biblioteca`, home (`app/page.tsx`) y `/juegos/[id]/jugar` leen el catálogo de la BD.
- Modal FIN DEL JUEGO: con sesión muestra el username fijo (sin input) y GUARDAR llama `submitScore`; invitado ve enlace "INICIA SESIÓN PARA COMPETIR" a `/auth` y no puede guardar; juegos no `playable` muestran "PARTIDA DEMO · NO PUNTÚA".
- `lib/session.tsx`: se elimina `saveScore` / `SavedScore`; se borra la key `av_scores` al montar.
- Estados vacíos: leaderboard sin filas, podio incompleto, juego en demo.
- Tipos regenerados en `lib/supabase/database.types.ts`.

**Out of scope (for future specs):**

- Anti-trampas / validación server-side de partidas (un usuario puede insertar un score arbitrario dentro de la cota vía API).
- Rate limiting de inserciones.
- Migrar puntajes locales `av_scores` a la cuenta.
- Puntajes de invitados.
- Panel de administración del catálogo (altas/bajas se hacen por migración).
- Leaderboards por periodo (semanal, mensual).
- Perfil público de jugador / historial de partidas.
- Datos reales en `components/home/live-activity.tsx` y en los STATS de la home (siguen mock).
- Port de nuevos juegos (Tetris, Arkanoid).
- Tests automatizados (no hay test runner configurado).

## Data model

### Base de datos (migración `<timestamp>_games_scores.sql`)

```sql
create table public.games (
  id         text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  title      text not null,
  short      text not null,
  long       text not null,
  cat        text not null check (cat in ('ARCADE', 'PUZZLE', 'SHOOTER', 'VERSUS')),
  cover      text not null,          -- clase CSS, ej. 'cover-rocas'
  color      text not null check (color in ('cyan', 'magenta', 'yellow', 'green')),
  playable   boolean not null default false,
  sort_order smallint not null unique,
  created_at timestamptz not null default now()
);
-- RLS: SELECT para anon y authenticated. Sin INSERT/UPDATE/DELETE (solo migraciones).

create table public.scores (
  id         bigint generated always as identity primary key,
  game_id    text not null references public.games (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  score      integer not null check (score between 1 and 9999999),
  created_at timestamptz not null default now()
);
create index scores_game_score_idx on public.scores (game_id, score desc, created_at);
create index scores_user_idx on public.scores (user_id);
-- RLS: SELECT para anon y authenticated.
-- INSERT para authenticated with check:
--   user_id = (select auth.uid())
--   and exists (select 1 from public.games g where g.id = game_id and g.playable)
-- Sin UPDATE/DELETE.

create view public.leaderboard with (security_invoker = true) as
-- mejor score por (game_id, user_id) con distinct on, ordenado score desc, created_at asc
-- columnas: game_id, user_id, username, score, achieved_at, rank
-- rank = row_number() over (partition by game_id order by score desc, achieved_at asc)

create view public.game_stats with (security_invoker = true) as
-- left join games → scores
-- columnas: game_id, best (coalesce(max(score), 0)), plays (count(scores.id))

-- Seed: insert de los 8 juegos de lib/games.ts con sus textos actuales,
-- sort_order 1..8 en el orden actual, playable = true solo para 'rocas'.
```

Convenciones:

- `best`/`plays` ya no son columnas de `games`: siempre se leen de `game_stats`.
- Vistas siempre con `security_invoker = true` para que apliquen las RLS de las tablas base.
- `auth.uid()` envuelto en `(select …)` en las políticas (recomendación de rendimiento de Supabase).

### TypeScript

```ts
// lib/games.ts (sin datos mock)
export interface Game {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string;
  color: GameColor;
  playable: boolean;
  best: number; // 0 = sin puntajes
  plays: number; // nº de puntajes guardados
}
export interface ScoreRow {
  rank: number;
  name: string; // profiles.username
  score: number;
  date: string; // "DD/MM/YYYY", formateado en servidor, timeZone UTC
}
export function formatPlays(n: number): string; // 12400 → "12.4K", 0 → "0"
export const SCORE_MAX = 9_999_999;
```

```ts
// lib/data/games.ts — import "server-only"; todas con "use cache"
export async function getGames(): Promise<Game[]>; // cacheTag("games","scores"), orden sort_order
export async function getGameById(id: string): Promise<Game | undefined>;
export async function getLeaderboard(
  gameId: string,
  limit: number,
): Promise<ScoreRow[]>; // cacheTag("scores")
export async function getAllLeaderboards(
  limit: number,
): Promise<Record<string, ScoreRow[]>>; // Salón, 1 query
```

```ts
// app/juegos/actions.ts — "use server"
export type ScoreErrorCode =
  | 'auth' // sin sesión
  | 'invalid' // score no entero o fuera de 1..SCORE_MAX, gameId inválido
  | 'not_playable' // juego inexistente o playable = false
  | 'config' // faltan env vars
  | 'server'; // cualquier otro error de Supabase / red
export type ScoreResult = { ok: true } | { ok: false; error: ScoreErrorCode };
export async function submitScore(
  gameId: string,
  score: number,
): Promise<ScoreResult>;
```

Textos del modal FIN DEL JUEGO:

| Caso                       | UI                                                          |
| -------------------------- | ----------------------------------------------------------- |
| Con sesión, juego playable | Nombre fijo `user.name` + botón GUARDAR PUNTUACIÓN          |
| Guardando                  | Botón deshabilitado "▶ GUARDANDO…"                          |
| Guardado                   | `▸ PUNTUACIÓN GUARDADA_` (existente)                        |
| Invitado, juego playable   | Enlace `INICIA SESIÓN PARA COMPETIR` → `/auth`, sin guardar |
| Juego no playable          | `PARTIDA DEMO · NO PUNTÚA`, sin guardar                     |
| Sesión cargando            | Botón GUARDAR deshabilitado                                 |
| `auth`                     | `[ERR] Tu sesión expiró. Inicia sesión de nuevo.`           |
| `invalid` / `not_playable` | `[ERR] Puntuación no válida.`                               |
| `config`                   | `[ERR] Servidor no configurado.`                            |
| `server`                   | `[ERR] Fallo de conexión. Reintenta.` (botón sigue activo)  |

Estados vacíos:

- Leaderboard (ficha / tabla Salón) sin filas, juego playable: `SIN PUNTUACIONES AÚN · SÉ EL PRIMERO`.
- Juego no playable (ficha y pestaña Salón): `MODO DEMO · SIN RANKING`.
- Podio con menos de 3 filas: puestos vacíos muestran `---` sin puntaje.
- "TU MEJOR MARCA" sin fila del usuario: `▸ AÚN SIN MARCA EN <TÍTULO>`.
- MEJOR GLOBAL con `best = 0` (ficha y cards): `—`.

## Estructura de archivos

```
supabase/migrations/<ts>_games_scores.sql  # NUEVO
lib/
  games.ts                     # MODIFICA: quita GAMES/getGame/seededScores/PLAYERS; añade playable, plays:number, formatPlays, SCORE_MAX
  data/games.ts                # NUEVO: server-only, lecturas cacheadas
  session.tsx                  # MODIFICA: quita saveScore/SavedScore; borra av_scores al montar
  supabase/
    public.ts                  # NUEVO: createClient<Database> de supabase-js sin cookies (persistSession: false)
    database.types.ts          # REGENERA
app/
  page.tsx                     # MODIFICA: await getGames()
  biblioteca/page.tsx          # MODIFICA: getGames() → <Library games>
  juegos/
    actions.ts                 # NUEVO: submitScore
    [id]/page.tsx              # MODIFICA: getGameById, getLeaderboard(id, 10), generateStaticParams desde getGames
    [id]/jugar/page.tsx        # MODIFICA: getGameById, generateStaticParams desde getGames
  salon/page.tsx               # MODIFICA: getGames + getAllLeaderboards(12) → <HallOfFame>
components/
  library.tsx                  # MODIFICA: recibe games por prop
  game-card.tsx                # MODIFICA: best 0 → "—"
  leaderboard.tsx              # MODIFICA: estados vacío / demo
  hall-of-fame.tsx             # MODIFICA: datos por props; TU MEJOR MARCA real (browser client → leaderboard)
  game-player.tsx              # MODIFICA: modal con submitScore, nombre fijo, invitado, demo
app/globals.css                # MODIFICA: estilos de estados vacíos / demo / [ERR] del modal si no existen
```

`components/home/mini-card.tsx` solo cambia si usa `best`/`plays` con el tipo antiguo.

## Implementation plan

1. Leer `node_modules/next/dist/docs/01-app/` (`08-caching.md`, `09-revalidating.md`, API de `use cache`, `cacheTag`, `updateTag`, `generateStaticParams` con Cache Components). Confirmar que `"use cache"` no puede leer `cookies()` y que `updateTag` solo se usa en Server Actions.
2. `npx supabase migration new games_scores` y escribir la migración del Data model (tablas, índices, RLS, vistas, seed). `npm run db:push`. Verificar con MCP `list_tables`: `games` (8 filas) y `scores` con RLS; `get_advisors` (security) sin avisos sobre `games`, `scores`, `leaderboard`, `game_stats`.
3. `npm run db:types`. Verificar: `database.types.ts` incluye `games`, `scores` y las vistas `leaderboard`, `game_stats`.
4. Crear `lib/supabase/public.ts` (sin cookies, `auth.persistSession: false`; lanza `SupabaseConfigError` si faltan env vars).
5. Modificar `lib/games.ts` (tipos, `formatPlays`, `SCORE_MAX`; quitar mock) y crear `lib/data/games.ts`. Join `games` + `game_stats`; mapeo snake_case → `Game`; fechas a `DD/MM/YYYY` en UTC. Error de config o de red → `console.error` y lanzar (lo captura el `error`/`not-found` de la ruta) salvo `getGameById`, que devuelve `undefined` solo cuando la fila no existe.
6. Migrar consumidores del catálogo: `app/page.tsx`, `app/biblioteca/page.tsx` + `library.tsx` (prop `games`), `app/juegos/[id]/jugar/page.tsx`, `game-card.tsx`. Verificar: `npm run dev`, `/`, `/biblioteca`, `/juegos/rocas/jugar` se ven igual que antes salvo MEJOR PUNTUACIÓN = `—`.
7. Ficha `app/juegos/[id]/page.tsx`: `getGameById`, `getLeaderboard(id, 10)`, PARTIDAS con `formatPlays`, MEJOR GLOBAL real. `leaderboard.tsx`: estados vacío y demo.
8. Crear `app/juegos/actions.ts` con `submitScore`: `Number.isInteger` y rango → `invalid`; `getUser()` server client → `auth`; insert con `user_id = user.id`; violación de RLS / FK → `not_playable`; env faltante → `config`; resto → `server`; éxito → `updateTag("scores")`. Nunca lanzar al cliente.
9. `lib/session.tsx`: quitar `saveScore`, `SavedScore`, `SCORES_KEY` de la API; `localStorage.removeItem("av_scores")` al montar.
10. `components/game-player.tsx`: `usePlayerName` sin edición (`user?.name ?? "INVITADO"`); modal según la tabla de textos; `useTransition` para GUARDAR; reset de error y `saved` en JUGAR DE NUEVO. La rama simulador usa el caso "PARTIDA DEMO".
11. Salón: `app/salon/page.tsx` carga `getGames()` + `getAllLeaderboards(12)` y pasa props; `hall-of-fame.tsx` usa props, podio con huecos `---`, pestaña demo, y "TU MEJOR MARCA": con `user` y `!loading`, consulta `leaderboard` con el browser client por `game_id` + `user_id = auth.getUser().id` y muestra `rank`/`score`/`date` o el estado vacío. Se re-consulta al cambiar de pestaña.
12. Estilos de estados vacíos / demo / `[ERR]` del modal en `app/globals.css`, reutilizando `.terminal-error` y clases existentes. Seguir `/frontend-design` según `CLAUDE.md`.
13. Prueba end-to-end: con sesión jugar ROCAS → GUARDAR → volver a `/juegos/rocas` y `/salon` → aparece el puntaje. Luego `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] `npm run build` termina sin errores con `.env.local` configurado.
- [ ] `npm run lint` termina sin errores.
- [ ] `supabase/migrations/` contiene 2 migraciones y `npm run db:push` no reporta cambios pendientes.
- [ ] `public.games` tiene 8 filas; solo `rocas` con `playable = true`.
- [ ] `get_advisors` (security) no reporta avisos sobre `games`, `scores`, `leaderboard` ni `game_stats`.
- [ ] `grep -rn "seededScores\|GAMES\b" app components lib` (excluyendo `database.types.ts`) no devuelve resultados.
- [ ] `/biblioteca`, la home y `/juegos/[id]` muestran los 8 juegos con los mismos títulos, textos, covers y orden que antes.
- [ ] `/juegos/no-existe` y `/juegos/no-existe/jugar` siguen devolviendo 404.
- [ ] Con sesión, terminar una partida de ROCAS muestra el username fijo y GUARDAR deja una fila en `scores` con `user_id` del usuario.
- [ ] Durante el guardado el botón muestra "GUARDANDO…" y está deshabilitado; tras éxito se ve `▸ PUNTUACIÓN GUARDADA_`.
- [ ] Tras guardar, `/juegos/rocas` muestra el puntaje en el leaderboard y actualiza PARTIDAS y MEJOR GLOBAL sin recargar el servidor ni esperar caducidad.
- [ ] Tras guardar, `/salon` pestaña ROCAS muestra el puntaje en la tabla/podio y "TU MEJOR MARCA" con el rango real.
- [ ] Un usuario con dos puntajes en ROCAS aparece una sola vez, con el mayor.
- [ ] Dos usuarios con el mismo puntaje: el que lo logró antes tiene mejor rango.
- [ ] Invitado: el modal muestra "INICIA SESIÓN PARA COMPETIR" con enlace a `/auth` y no hay botón GUARDAR.
- [ ] En un juego simulado (p.ej. `/juegos/caida/jugar`) el modal muestra "PARTIDA DEMO · NO PUNTÚA" y no hay botón GUARDAR.
- [ ] Insert directo vía API con la publishable key y sesión de A usando `user_id` de B → rechazado por RLS.
- [ ] Insert directo con `game_id = 'caida'` → rechazado por RLS.
- [ ] Insert directo con `score = 0` o `10000000` → rechazado por el `check`.
- [ ] Insert sin sesión (anon) → rechazado.
- [ ] `submitScore` con score `12.5` o `-1` devuelve `invalid` sin llamar a Supabase.
- [ ] Ficha de un juego playable sin puntajes muestra "SIN PUNTUACIONES AÚN · SÉ EL PRIMERO" y MEJOR GLOBAL `—`.
- [ ] Ficha y pestaña Salón de un juego no playable muestran "MODO DEMO · SIN RANKING".
- [ ] Podio con 1 puntaje muestra los puestos 02 y 03 con `---`.
- [ ] Tras montar la app, `localStorage` no contiene `av_scores`.
- [ ] Ninguna secret / service_role key en el bundle (`grep` en `.next/static` sin resultados).
- [ ] Sin errores de hidratación en consola en `/`, `/biblioteca`, `/juegos/rocas`, `/juegos/rocas/jugar` y `/salon`.

## Decisions

- **Yes:** catálogo en `public.games` como fuente de verdad. Permite FK de `scores` y estadísticas reales.
- **No:** BD como espejo de `lib/games.ts`. Dos fuentes que se desincronizan.
- **Yes:** altas/bajas de juegos por migración. Sin panel admin; el catálogo cambia poco.
- **Yes:** solo usuarios con sesión puntúan; nombre = `profiles.username`. Evita nombres falsos y moderación.
- **No:** puntajes de invitados con nombre libre.
- **Yes:** `games.playable` y solo juegos con motor real puntúan. El simulador generaría puntajes falsos.
- **Yes:** guardar todas las partidas; el ranking muestra el mejor por usuario. Conserva historial para specs futuros.
- **No:** varias filas por usuario en el ranking.
- **Yes:** desempate por fecha más antigua (`row_number`). Ranking estable sin empates.
- **Yes:** vistas `leaderboard` y `game_stats` con `security_invoker`. Lógica de ranking en SQL, RLS respetada.
- **No:** función RPC. Más código sin beneficio para lecturas simples.
- **Yes:** Server Action `submitScore` + RLS + `check`. Doble barrera, coherente con SPEC 03/04.
- **No:** insert directo desde el browser. Validación solo en BD y sin `updateTag`.
- **Yes:** cota `1..9 999 999`. Score 0 no aporta al ranking; la cota frena valores absurdos.
- **No:** anti-trampas real. Su propio spec.
- **Yes:** lecturas con `"use cache"` + `cacheTag`, cliente sin cookies; `updateTag("scores")` tras insertar. Leaderboard fresco al instante y páginas en el static shell.
- **No:** `cacheLife` por tiempo. Ranking desfasado justo después de jugar.
- **Yes:** "TU MEJOR MARCA" consultada en el cliente. Depende de la sesión; no rompe el caché compartido del Salón.
- **No:** leer la sesión en `app/salon/page.tsx`. Con `cacheComponents` obliga a `Suspense` y saca la página del static shell.
- **Yes:** `best`/`plays` reales vía `game_stats`. Cero valores inventados en la UI.
- **No:** columnas mock `best`/`plays` en `games`.
- **Yes:** `av_scores` se deja de usar y se borra; sin migración. Subir puntajes locales sería trivial de falsificar.
- **Yes:** modal con nombre fijo y botón GUARDAR explícito.
- **No:** auto-guardar al terminar. El usuario decide qué partida registra.
- **Yes:** pestañas del Salón para todos los juegos, con "MODO DEMO" en los no playable. Mantiene el diseño actual.
- **Yes:** el build requiere `.env.local` (rompe el criterio de SPEC 04 "build sin env"). `generateStaticParams` y el static shell necesitan el catálogo de la BD.

## Risks

| Risk                                                                     | Mitigation                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Build falla sin env vars o sin red a Supabase                            | Decisión aceptada y documentada en el PR; error con nombre de variable desde `public.ts`.         |
| `"use cache"` con el server client que lee `cookies()` → error de Next   | Lecturas públicas siempre con `lib/supabase/public.ts`; `server.ts` solo en la action.            |
| Vistas sin `security_invoker` saltan RLS (aviso de advisors)             | `with (security_invoker = true)` explícito; criterio `get_advisors`.                              |
| Puntajes falsificados vía API dentro de la cota                          | Aceptado; anti-trampas en spec futuro. RLS impide suplantar a otro usuario o puntuar juegos demo. |
| Spam de inserts infla `plays`                                            | Aceptado; rate limiting en spec futuro.                                                           |
| `updateTag` no refresca la ficha si el router reutiliza el caché cliente | Probar el flujo "guardar → VOLVER AL VAULT → ficha"; si falla, `router.refresh()` tras éxito.     |
| Fecha formateada distinta en server y cliente (hidratación)              | Formateo en servidor con `timeZone: "UTC"`; el Salón recibe strings ya formateados.               |
| Seed con textos distintos a los actuales                                 | Copiar literal desde `lib/games.ts` antes de borrar `GAMES`; criterio de mismos textos y orden.   |
| `supabase gen types` en Windows escribe UTF-16                           | Mismo procedimiento que SPEC 04 (Git Bash o MCP `generate_typescript_types`).                     |

## What is **not** in this spec

- Anti-trampas y rate limiting.
- Puntajes de invitados y migración de `av_scores`.
- Panel de administración del catálogo.
- Leaderboards por periodo.
- Perfil público / historial de partidas.
- Datos reales en live-activity y STATS de la home.
- Nuevos juegos jugables.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
