# Contrato de integración de un juego jugable

Resumen operativo de SPEC 05 (motores) y SPEC 06 (catálogo + leaderboard), escrito para redactar specs de juegos nuevos. Si el código ya no coincide con algo de aquí, **manda el código**: verifica con Read/Grep antes de copiarlo al spec.

## Índice

1. Qué ya funciona sin tocarlo
2. Archivos que toca un juego nuevo
3. Reglas del motor
4. Entrada en el catálogo (migración)
5. Huecos conocidos de generalización
6. Nombres y estética
7. Puntuación y leaderboard
8. Verificación estándar

---

## 1. Qué ya funciona sin tocarlo

Cuando un juego tiene `games.playable = true` y motor registrado, todo esto funciona solo:

- `/juegos/<id>`: leaderboard top 10, PARTIDAS y MEJOR GLOBAL (`lib/data/games.ts`, vista `game_stats`).
- `/salon`: pestaña del juego con podio, top 12 y "TU MEJOR MARCA" (las pestañas salen de `getGames()`).
- Modal FIN DEL JUEGO: GUARDAR → `submitScore` (`app/juegos/actions.ts`) → `updateTag("scores")`. Invitado ve "INICIA SESIÓN PARA COMPETIR".
- RLS de `public.scores`: solo inserta el propio usuario y solo en juegos `playable`.
- `/juegos/<id>/jugar`: `GamePlayer` elige motor real con `getEngine(game.id)` o el simulador.

Por eso un spec de juego **no** reescribe nada de leaderboard, Server Action, vistas ni RLS. Si el spec lo incluye, sobra.

## 2. Archivos que toca un juego nuevo

```
lib/engines/<motor>.ts            # NUEVO: createX(canvas, cb): GameEngine — port o diseño
lib/engines/registry.ts           # MODIFICA: registrar <id> → factory (+ metadatos si ya existen)
supabase/migrations/<ts>_<id>_playable.sql  # NUEVO: playable = true (o insert de juego nuevo)
app/globals.css                   # MODIFICA solo si: cover nueva, o estilos de HUD/overlay nuevos
components/game-player.tsx        # MODIFICA solo si hace falta generalizar HUD/controles (§5)
lib/engines/types.ts              # MODIFICA solo si hace falta generalizar EngineStats (§5)
public/games/<id>/...             # NUEVO solo si se decide copiar assets
```

Nombre del motor: describe la mecánica (`asteroids.ts`, `tetris.ts`, `breakout.ts`); la clave del registro es el `id` del catálogo (`rocas`, `caida`, `bloque-buster`).

`app/juegos/[id]/jugar/page.tsx` no cambia: el motor se resuelve en el cliente (las factories no cruzan la frontera server/client).

`lib/supabase/database.types.ts` solo se regenera (`npm run db:types`) si la migración cambia el esquema; un `update`/`insert` de filas no lo requiere.

## 3. Reglas del motor

Interfaz (`lib/engines/types.ts`): `EngineFactory = (canvas, cb) => GameEngine` con `pause / resume / restart / end / destroy`, callbacks `onStats / onStateChange / onGameOver`, estados `ready | playing | dead | paused | gameover`. `lib/engines/asteroids.ts` es la implementación de referencia: el spec debe pedir que se siga su estructura.

Reglas que el spec debe exigir (todas vienen de SPEC 05 y evitan bugs ya vistos):

- **Closure sin globals**: todo el estado dentro de la factory. Nada de `document.getElementById`, nada de código que toque `window` a nivel de módulo (SSR).
- **Lienzo lógico 800×600** escalado por `devicePixelRatio` (`canvas.width = 800 * dpr`, `ctx.setTransform(dpr,…)`). `.crt-screen` es 4:3. Si el original tiene otra proporción (Tetris: tablero 300×600 + preview), el spec define cómo se compone dentro de 800×600 (tablero centrado, panel lateral con "siguiente pieza", etc.).
- **Sin HUD ni overlays dibujados en canvas**: score/vidas/nivel van al `player-hud` React vía `onStats`; PAUSA, inicio y GAME OVER son overlays/modal React. Elementos *de juego* que no son HUD (p.ej. la preview de la siguiente pieza en Tetris) sí pueden dibujarse en canvas — el spec lo decide explícitamente.
- **Estados**: arranca en `ready` (fondo animado o tablero vacío, sin control del jugador); la tecla de inicio pasa a `playing`. `restart()` va directo a `playing` con stats iniciales. `end()` y el fin natural → `gameover` + `onGameOver(score)` una sola vez. `dead` es opcional (solo si hay espera tras perder vida).
- **`onStats` solo cuando cambia algún valor**, nunca cada frame.
- **`dt` limitado** (50 ms) para que una pestaña en segundo plano no provoque saltos.
- **Input**: listeners en `window` (`keydown`/`keyup`), ignorar si el target es `input`/`textarea`/contenteditable, `preventDefault` en las teclas del juego mientras el estado no sea `gameover`. `P`/`Escape` alternan pausa con `e.repeat` ignorado. Limpiar teclas pulsadas al reanudar y reiniciar.
- **Ratón** (si el juego lo usa): listeners en el `canvas`, coordenadas convertidas a lógicas con `getBoundingClientRect()` → `(clientX - rect.left) * 800 / rect.width`. Retirarlos en `destroy()`.
- **`visibilitychange`** → `pause()` si `playing`/`dead`.
- **`destroy()` idempotente**: cancela rAF y quita todos los listeners (StrictMode monta dos veces).
- **Paleta neón** con los mismos hex que los tokens de `app/globals.css`: `--cyan #00f5ff`, `--magenta #ff006e`, `--yellow #f5ff00`, `--green #00ff88`, fondo `#000`. Glow con `shadowBlur` solo en los objetos principales. El spec incluye una tabla elemento → color como la de SPEC 05.

## 4. Entrada en el catálogo (migración)

`public.games` no tiene políticas de escritura: el catálogo cambia **solo por migración** (`npx supabase migration new <nombre>` → `npm run db:push`).

**Reusar un mock existente** (caso habitual):

```sql
update public.games
set playable = true,
    long = '<texto ajustado a lo que el juego realmente tiene>'
where id = '<id>';
```

Ajustar `long` cuando el texto mock prometa mecánicas que el port no tiene (SPEC 05 quitó "OVNIs" de ROCAS).

**Juego nuevo**:

```sql
insert into public.games (id, title, short, long, cat, cover, color, playable, sort_order)
values ('<id>', '<TÍTULO>', '<short>', '<long>', '<ARCADE|PUZZLE|SHOOTER|VERSUS>',
        'cover-<x>', '<cyan|magenta|yellow|green>', true,
        (select max(sort_order) + 1 from public.games));
```

Restricciones del esquema: `id ~ '^[a-z0-9-]{2,32}$'`, `cat` y `color` con `check`, `sort_order` único. Una categoría nueva exige cambiar el `check` y el tipo `GameCategory` + `CATS` en `lib/games.ts` — es scope extra, márcalo como decisión.

Cover nueva: clase `.cover-<x>` (+ `::before`/`::after`) en `app/globals.css` junto a las demás, hecha solo con CSS (gradientes, glifos), como `.cover-rocas`.

Caché: el catálogo se lee con `"use cache"` + `cacheTag("games")`. Una migración no invalida esa caché; el spec debe indicar reiniciar `npm run dev` (o hacer `npm run build`) antes de verificar que el juego aparece como jugable.

## 5. Huecos conocidos de generalización

SPEC 05 se diseñó con un único motor. Antes de escribir el spec, comprueba en el código si estos huecos siguen abiertos; si lo están y el juego nuevo los necesita, el spec incluye la generalización como **primeros pasos del plan**, con el criterio "ROCAS se ve y juega igual que antes".

| Hueco | Dónde | Cuándo importa |
| --- | --- | --- |
| `EngineStats` fijo `{score, lives, level, powerUp}` con `powerUp` específico de ROCAS | `lib/engines/types.ts`, `HudStats` en `components/game-player.tsx` | Juegos sin vidas (Tetris), con stats extra (líneas, combo) o sin power-up |
| Tabla de controles del overlay de inicio hardcodeada (rotar / propulsar / disparar) | `EnginePlayer` en `components/game-player.tsx` | Cualquier juego con otros controles |
| "PULSA ESPACIO PARA EMPEZAR" fijo | mismo overlay | Juegos que arranquen con otra tecla o con clic |
| `INITIAL_STATS` con `lives: 3` | `components/game-player.tsx` | Juegos sin vidas o con otro número |

Forma recomendada (propónla al usuario, no la impongas):

```ts
// lib/engines/types.ts
export interface EngineStats {
  score: number;
  lives?: number;          // omitido → el HUD no muestra VIDAS
  level?: number;          // omitido → el HUD no muestra NIVEL
  extras?: HudExtra[];     // stats propios del juego, en orden
}
export interface HudExtra {
  key: string;             // estable, para React
  label: string;           // "LÍNEAS", "3X"
  value: string;           // ya formateado: "12", "4.2s"
  tone?: "cyan" | "magenta" | "yellow" | "green";
}

// lib/engines/registry.ts
export interface EngineEntry {
  factory: EngineFactory;
  startLabel: string;                                   // "PULSA ESPACIO PARA EMPEZAR"
  controls: { keys: string[]; action: string }[];       // filas de la tabla de controles
  initialStats: EngineStats;
}
export const ENGINES: Partial<Record<string, EngineEntry>>;
export function getEngine(id: string): EngineEntry | undefined;
```

ROCAS migra su `powerUp` a `extras: [{ key: "3x", label: "3X", value: "4.2s", tone: "green" }]` solo cuando está activo. Ojo: `onStats` debe seguir comparando por valor (incluyendo `extras`) para no re-renderizar cada frame.

Si un spec anterior ya hizo esta generalización, el spec nuevo **la reutiliza** y solo añade su entrada al registro.

## 6. Nombres y estética

El catálogo usa nombres originales en español (ROCAS, CAÍDA, BLOQUE BUSTER, SERPENTINA). Un juego nuevo sigue esa línea: nombre propio, gráficos vectoriales neón propios. No se usan nombres comerciales de juegos clásicos, ni sus sprites, logos o música, ni en el catálogo ni en la UI. Los sprites de una carpeta de referencia (p.ej. `04-arkanoid/assets/spritesheet-breakout.png`) son del proyecto del usuario, pero la recomendación por defecto es redibujar en vectorial neón para encajar con la plataforma.

## 7. Puntuación y leaderboard

- `public.scores.score` es `integer` con `check (score between 1 and 9999999)` y `SCORE_MAX` en `lib/games.ts`. El spec debe confirmar que una partida normal no supera la cota (si puede, el motor la satura con `Math.min`).
- Ranking = mejor puntaje por usuario, `score desc`, desempate por fecha más antigua. Juegos donde "menos es mejor" (tiempos) no encajan sin convertir el resultado a una puntuación.
- Score 0 no se puede guardar (el modal mostrará `[ERR] Puntuación no válida.`); es aceptable, pero el spec puede decidir ocultar GUARDAR con score 0 si el juego lo hace frecuente.
- Los puntajes llegan al servidor como un número que el cliente afirma: sin anti-trampas (fuera de scope, igual que SPEC 06).

## 8. Verificación estándar

Comandos y comprobaciones que todo spec de juego incluye en el plan/criterios:

- `npm run db:push` sin cambios pendientes tras aplicar; MCP `execute_sql`: `select id, playable from public.games where id = '<id>'` → `true`.
- MCP `get_advisors` (security) sin avisos nuevos.
- `npm run lint` y `npm run build` sin errores (el build necesita `.env.local`).
- Flujo e2e con sesión: jugar → FIN DEL JUEGO → GUARDAR → `/juegos/<id>` y `/salon` muestran el puntaje sin reiniciar el servidor.
- `/juegos/rocas/jugar` sigue funcionando igual (regresión del motor existente).
- Otro juego no jugable sigue mostrando el simulador y "PARTIDA DEMO · NO PUNTÚA".
- Salir y volver a entrar no duplica rAF/listeners.
- Sin errores de hidratación ni de consola en `/juegos/<id>/jugar`.
