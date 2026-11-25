# SPEC 08 — BLOQUE BUSTER jugable: port de Arkanoid a la plataforma

> **Status:** Implementado
> **Depends on:** SPEC 05, SPEC 06, SPEC 07
> **Date:** 2026-11-25
> **Objective:** Portar `references/started-games/04-arkanoid/game.js` a un motor TypeScript en canvas que convierta el juego mock `bloque-buster` en jugable con leaderboard real, en partida sin fin que repite los 5 patrones a mayor velocidad.

## Por qué existe este spec

`bloque-buster` es hoy una partida simulada. Este spec lo convierte en el tercer juego real, portado desde la referencia de Arkanoid. Es el primer motor que usa **ratón** además de teclado. Reutiliza el HUD y el registro genéricos de SPEC 07, así que no toca `components/game-player.tsx` ni `lib/engines/types.ts`. Cambia tres reglas del original para que funcione como juego de leaderboard: bucle infinito de niveles, puntos por nivel y saque manual.

## Scope

**In:**

- Port de `game.js` + `levels.js` a TypeScript estricto en `lib/engines/breakout.ts` (`createBreakout`) y `lib/engines/breakout-levels.ts` (`LEVELS`), sin globals, siguiendo la estructura de `lib/engines/asteroids.ts` y `lib/engines/tetris.ts`.
- Mecánicas del original: lienzo 800×600, paleta 81×14 en y = 560 a 400 px/s, pelota 16×16, rejilla de 10×6 bloques de 64×24, 3 vidas, 5 patrones de `levels.js`, una colisión de bloque por sub-paso que invierte `vy`.
- Cambios respecto al original (confirmados): rebote en la paleta con ángulo según el punto de impacto; pelota pegada a la paleta hasta lanzar con `Space` o clic; tras el nivel 5 se vuelve al patrón 1 con NIVEL 06, 07…; 10 × nivel puntos por bloque.
- Velocidad: `min(1.1^(nivel − 1), 2.0)` × rapidez base, con física en sub-pasos de ≤ 8 px.
- Fin de partida: vidas a 0 → `gameover` + `onGameOver(score)`.
- Explosión vectorial de 150 ms al romper un bloque.
- Recolor con hex de `app/globals.css` (tabla en Data model).
- HUD React: JUGADOR · PUNTUACIÓN · VIDAS · NIVEL. Sin extras.
- Overlay de inicio "PULSA ESPACIO PARA EMPEZAR" + tabla de controles de BLOQUE BUSTER; estado `ready` con el patrón 1 y la pelota sobre la paleta.
- Ratón: `mousemove` sobre el canvas centra la paleta; `mousedown` lanza la pelota.
- Pausa con botón, `P`, `Escape` y auto-pausa por visibilidad.
- Registro `bloque-buster` en `lib/engines/registry.ts`.
- Migración `supabase/migrations/<ts>_bloque_buster_playable.sql`: `playable = true`. Título, textos, cover, color y orden sin cambios.

**Out of scope (for future specs):**

- Controles táctiles / móvil jugable.
- Sonido (`ball-bounce.mp3`, `break-sound.mp3`).
- Sprites del original (`spritesheet-breakout.png`, `spritesheet.js`).
- Selector de nivel en la pausa y pantalla de victoria del original.
- Power-ups, bloques multigolpe, vidas extra.
- Cambiar `title`, `short`, `long`, `cover` o `color` de `bloque-buster`.
- Cambios en `components/game-player.tsx`, `lib/engines/types.ts` o el HUD (ya genéricos desde SPEC 07).
- Anti-trampas / validación server-side de partidas.
- Cambios en leaderboard, Salón o `submitScore` (ya genéricos desde SPEC 06).
- Modificar `references/started-games/04-arkanoid/`.
- Tests automatizados (no hay test runner configurado).

## Data model

No introduce tablas, columnas ni tipos nuevos. Reutiliza `EngineStats` y `EngineEntry` de SPEC 07. Cambia una fila de `public.games`.

### Registro

```ts
// lib/engines/registry.ts — entrada nueva
"bloque-buster": {
  factory: createBreakout,
  startLabel: "PULSA ESPACIO PARA EMPEZAR",
  controls: [
    { keys: ["←", "→", "RATÓN"], action: "MOVER" },
    { keys: ["ESPACIO", "CLIC"], action: "LANZAR" },
    { keys: ["P", "ESC"], action: "PAUSA" },
  ],
  initialStats: { score: 0, lives: 3, level: 1, extras: [] },
},
```

Stats emitidas: `{ score, lives, level, extras: [] }`, solo cuando `statsEqual` (de `lib/engines/stats.ts`) es falso.

### Niveles

```ts
// lib/engines/breakout-levels.ts
export type BrickColor =
  | 'gray'
  | 'red'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'hotpink'
  | 'green';
export interface BrickDef {
  col: number;
  row: number;
  color: BrickColor;
}
export interface LevelDef {
  blocks: BrickDef[];
}
export const LEVELS: readonly LevelDef[]; // 5 patrones, generados igual que levels.js
```

Los 5 patrones (parrilla 10×6, pirámide, ajedrez, filas con huecos, marco + cruz) y sus colores por fila se copian de `levels.js`. El campo `speed` del original no se copia: la velocidad sale de la fórmula de abajo. Patrón del nivel `n` = `LEVELS[(n − 1) % 5]`.

### Motor `lib/engines/breakout.ts`

| Constante         | Valor                                                                                                                                   | Origen                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --- | --- | ---------------------- | -------- |
| Lienzo lógico     | 800 × 600                                                                                                                               | `game.js`                                       |
| Paleta            | 81 × 14, `y = 560`, centrada al cargar                                                                                                  | `game.js` (el README dice 162; manda el código) |
| `PADDLE_SPEED`    | 400 px/s                                                                                                                                | `game.js`                                       |
| Pelota            | 16 × 16 (dibujada como círculo de radio 8)                                                                                              | `game.js`                                       |
| Rejilla           | 10 × 6, bloque 64 × 24, origen (80, 80)                                                                                                 | `game.js`                                       |
| Rapidez base      | `√(200² + 300²)` ≈ 360,6 px/s                                                                                                           | `game.js` (`BASE_BALL_VX/VY`)                   |
| Multiplicador     | `min(1.1^(nivel − 1), 2.0)`; tope alcanzado en nivel 9                                                                                  | decisión                                        |
| Ángulo de saque   | `atan2(200, 300)` ≈ 33,7° desde la vertical, hacia la derecha                                                                           | `game.js`                                       |
| Rebote en paleta  | `offset = clamp((centroPelota − centroPaleta) / (81 / 2), −1, 1)`; ángulo `offset × 60°` desde la vertical; `vx = v·sin`, `vy = −v·cos` | decisión                                        |
| Detección paleta  | `vy > 0`, solape horizontal, `ball.y + 16` entre `560` y `560 + 14 + 8`                                                                 | `game.js`                                       |
| Paredes           | izquierda, derecha y techo rebotan; `ball.y > 600` pierde vida                                                                          | `game.js`                                       |
| Bloque            | AABB; invierte `vy`; un bloque por sub-paso                                                                                             | `game.js`                                       |
| Sub-pasos         | `ceil(max(                                                                                                                              | vx                                              | ,   | vy  | ) × dt / 8)` por frame | decisión |
| Vidas             | 3                                                                                                                                       | `game.js`                                       |
| Puntos por bloque | `10 × nivel`                                                                                                                            | decisión                                        |
| Explosión         | 150 ms                                                                                                                                  | `EXPLOSION_DURATION`                            |
| `dt` máximo       | 50 ms                                                                                                                                   | SPEC 05                                         |
| Score máximo      | `Math.min(score, SCORE_MAX)`                                                                                                            | SPEC 06                                         |

Saque: la pelota está pegada a la paleta (`x` centrada sobre ella, `y = 560 − 16`) al empezar la partida, al empezar cada nivel y tras perder una vida. Mientras está pegada sigue a la paleta. `Space` o `mousedown` en el canvas la lanza con el ángulo de saque y la rapidez del nivel. Es un flag interno del estado `playing`, no un `EngineState` nuevo.

Nivel completado: al romperse el último bloque se carga el patrón siguiente, NIVEL sube 1 y la pelota vuelve a la paleta. Las vidas y la puntuación se conservan.

Estados: `ready` → (`Space`) → `playing` ⇄ `paused` → `gameover`. No usa `dead`. El `Space` que pasa de `ready` a `playing` no lanza la pelota. `restart()` va directo a `playing` con patrón 1, pelota pegada, score 0, vidas 3, nivel 1.

Paleta (hex de los tokens de `app/globals.css`):

| Elemento         | Color                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Paleta           | cyan `#00f5ff` (`--cyan`) con glow                                                    |
| Pelota           | amarillo `#f5ff00` (`--yellow`) con glow                                              |
| Bloque `cyan`    | `#00f5ff` (`--cyan`)                                                                  |
| Bloque `yellow`  | `#f5ff00` (`--yellow`)                                                                |
| Bloque `magenta` | `#ff006e` (`--magenta`)                                                               |
| Bloque `green`   | `#00ff88` (`--green`)                                                                 |
| Bloque `red`     | `#d97a3a` (`--bronze`)                                                                |
| Bloque `hotpink` | `#e6e9ff` (`--ink`)                                                                   |
| Bloque `gray`    | `#c7d0e0` (`--silver`)                                                                |
| Explosión        | color del bloque; rectángulo que crece de ×1,0 a ×1,4 y pasa de alpha 1 a 0 en 150 ms |
| Fondo            | `#000`                                                                                |

Bloque: relleno del color con 2 px de separación y franja superior de 4 px `rgba(255,255,255,0.12)`. Bloques sin glow; glow (`shadowBlur`) solo en paleta y pelota.

Teclas: `ArrowLeft`/`ArrowRight` mover, `Space` empezar (en `ready`) o lanzar (en `playing` con la pelota pegada, ignorando `e.repeat`), `KeyP`/`Escape` pausa (ignorando `e.repeat`). Ratón: `mousemove` en el canvas → `paddle.x = clamp(mouseX − 81/2, 0, 800 − 81)` con `mouseX = (clientX − rect.left) × 800 / rect.width`, solo en `playing`; `mousedown` lanza.

Puntuación: romper un bloque suma `10 × nivel`. Nivel 1 completo (60 bloques) = 600.

### Catálogo

```sql
-- supabase/migrations/<ts>_bloque_buster_playable.sql
update public.games
set playable = true
where id = 'bloque-buster';
```

## Estructura de archivos

```
lib/engines/breakout-levels.ts  # NUEVO: LEVELS (5 patrones)
lib/engines/breakout.ts         # NUEVO: createBreakout(canvas, cb)
lib/engines/registry.ts         # MODIFICA: registra bloque-buster
supabase/migrations/<ts>_bloque_buster_playable.sql  # NUEVO
```

`components/game-player.tsx`, `components/game-canvas.tsx`, `lib/engines/types.ts`, `app/globals.css` y `app/juegos/[id]/jugar/page.tsx` no cambian.

## Implementation plan

1. Releer `lib/engines/tetris.ts`, `lib/engines/asteroids.ts` y `lib/engines/stats.ts` como referencia de estructura. Consultar `node_modules/next/dist/docs/01-app/` solo si surge algo de framework.
2. Crear `lib/engines/breakout-levels.ts` con `LEVELS` portado de `levels.js`. Verificar: `npm run build` pasa; `LEVELS[0].blocks.length === 60`.
3. Crear `lib/engines/breakout.ts`: factory con escalado `devicePixelRatio`, loop rAF con `dt` ≤ 50 ms, estado `ready` dibujando el patrón 1, la paleta y la pelota pegada, `destroy()` idempotente. Registrar `bloque-buster`. Verificar: `/juegos/bloque-buster/jugar` muestra el muro y el overlay con los controles de BLOQUE BUSTER (modal aún en modo demo).
4. Movimiento y saque: teclado ←/→ con `PADDLE_SPEED`, `Space` en `ready` → `playing`, pelota pegada que sigue a la paleta, lanzamiento con `Space`. Listeners `keydown`/`keyup` en `window`, ignorar `input`/`textarea`/contenteditable, `preventDefault` en las teclas del juego fuera de `gameover`. Verificar: la paleta se mueve y la pelota sale con el ángulo de saque.
5. Física: sub-pasos, rebote en paredes y techo, rebote en paleta con ángulo por impacto, colisión AABB con bloques (un bloque por sub-paso, invierte `vy`). Verificar: impactar con el borde de la paleta inclina la salida; la pelota no atraviesa bloques.
6. Puntuación, vidas y progresión: `10 × nivel` por bloque, pérdida de vida con pelota pegada, nivel completado → patrón `(n − 1) % 5`, multiplicador con tope 2,0, fin por vidas a 0; `onStats` con `statsEqual`; `Math.min` con `SCORE_MAX`. Verificar: HUD actualiza PUNTUACIÓN, VIDAS y NIVEL; perder 3 pelotas abre el modal.
7. Ratón: `mousemove` y `mousedown` en el canvas con coordenadas lógicas, solo en `playing`; retirarlos en `destroy()`. Verificar: el ratón mueve la paleta y el clic lanza.
8. Dibujo final: paleta de colores de la tabla, glow en paleta y pelota, explosión de 150 ms. Verificar: colores y nitidez con DPR 2.
9. Ciclo de vida: `pause`/`resume` (P, Escape, botón) limpiando teclas pulsadas, `visibilitychange` → `pause()` si `playing`, `end()` → `gameover` + `onGameOver(score)` una sola vez, `restart()`. Verificar: salir y volver no duplica rAF ni listeners; `npm run lint` y `npm run build` pasan.
10. `npx supabase migration new bloque_buster_playable` con el SQL del Data model; `npm run db:push`; MCP `execute_sql` (`select id, playable from public.games where id = 'bloque-buster'` → `true`) y `get_advisors` (security); reiniciar `npm run dev` (caché `"use cache"` del catálogo). Verificar: con sesión, GUARDAR en `/juegos/bloque-buster/jugar` y el puntaje aparece en `/juegos/bloque-buster` y `/salon`.

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `npm run db:push` no reporta cambios pendientes; la fila `bloque-buster` de `public.games` tiene `playable = true` y el resto de columnas sin cambios.
- [ ] `get_advisors` (security) sin avisos nuevos.
- [ ] `git diff main -- components/game-player.tsx lib/engines/types.ts app/globals.css` está vacío.
- [ ] `/juegos/bloque-buster/jugar` muestra en el CRT el muro 10×6 del patrón 1, la paleta cyan y la pelota amarilla sobre ella, y el overlay "PULSA ESPACIO PARA EMPEZAR" con las filas MOVER (←/→/RATÓN), LANZAR y PAUSA.
- [ ] Espacio arranca la partida sin lanzar la pelota; un segundo Espacio o un clic en el canvas la lanza.
- [ ] Con la pelota pegada, mover la paleta mueve la pelota con ella.
- [ ] ←/→ y el ratón mueven la paleta sin salirse del lienzo.
- [ ] La pelota rebota en las paredes izquierda, derecha y superior.
- [ ] Un impacto en el centro de la paleta devuelve la pelota casi vertical; un impacto en el borde la desvía hasta 60° hacia ese lado.
- [ ] Romper un bloque en nivel 1 suma 10; en nivel 3 suma 30.
- [ ] Romper un bloque muestra una explosión de su color que se desvanece en 150 ms.
- [ ] Vaciar el muro sube NIVEL en 1, carga el patrón siguiente y deja la pelota pegada a la paleta con vidas y puntuación intactas.
- [ ] Tras completar el nivel 5 aparece el patrón 1 con NIVEL 06.
- [ ] La pelota es visiblemente más rápida en nivel 2 que en nivel 1, y en nivel 10 va igual de rápida que en nivel 9.
- [ ] La pelota no atraviesa bloques en nivel 9 o superior.
- [ ] Perder la pelota resta 1 en VIDAS y la deja pegada a la paleta.
- [ ] Perder la tercera pelota abre el modal FIN DEL JUEGO con la puntuación real.
- [ ] El HUD muestra JUGADOR, PUNTUACIÓN, VIDAS y NIVEL y se actualiza durante la partida.
- [ ] JUGAR DE NUEVO deja el patrón 1, PUNTUACIÓN 0, VIDAS 3, NIVEL 01, jugando con la pelota pegada.
- [ ] PAUSA, `P` y `Escape` congelan la pelota y muestran "EN PAUSA"; REANUDAR / `P` / `Escape` la continúan; cambiar de pestaña deja el juego en pausa.
- [ ] Durante la pausa ni las flechas ni el ratón mueven la paleta.
- [ ] FIN durante la partida abre el modal con la puntuación actual.
- [ ] Las teclas del juego no hacen scroll ni reactivan botones con foco.
- [ ] Salir y volver a entrar no duplica la velocidad de la pelota, rAF ni listeners de teclado o ratón.
- [ ] Con sesión, GUARDAR deja una fila en `scores` con `game_id = 'bloque-buster'` y el puntaje aparece en `/juegos/bloque-buster` (leaderboard, PARTIDAS, MEJOR GLOBAL) y en `/salon` pestaña BLOQUE BUSTER sin reiniciar el servidor.
- [ ] Invitado ve "INICIA SESIÓN PARA COMPETIR" y no puede guardar.
- [ ] `/juegos/rocas/jugar` y `/juegos/caida/jugar` se ven y juegan igual que antes.
- [ ] Un juego no jugable (p.ej. `/juegos/serpentina/jugar`) sigue mostrando el simulador y "PARTIDA DEMO · NO PUNTÚA".
- [ ] En viewport táctil emulado el overlay muestra "REQUIERE TECLADO".
- [ ] El canvas se ve nítido con `devicePixelRatio` 2.
- [ ] Sin errores de hidratación ni de consola en `/juegos/bloque-buster/jugar`.
- [ ] `references/started-games/04-arkanoid/` sin cambios.

## Decisions

- **Yes:** reusar el mock `bloque-buster` tal cual (solo `playable = true`). Su `long` ("cada nivel reorganiza la grilla… ¿hasta dónde llegará tu racha?") encaja con el bucle de niveles; se mantienen URL, cover y orden.
- **No:** ajustar `long` o crear una entrada nueva. Sin beneficio; una entrada nueva duplicaría el juego.
- **Yes:** bucle infinito: tras el nivel 5 vuelve el patrón 1 con NIVEL 06. Partida sin techo, apta para leaderboard.
- **No:** victoria que termina la partida tras el nivel 5 (original), ni victoria con bonus por vidas. Topan la puntuación y empatan a los mejores.
- **Yes:** `10 × nivel` por bloque. Premia avanzar y separa puntuaciones en el leaderboard.
- **No:** 10 fijos del original.
- **Yes:** rebote en paleta con ángulo según impacto (±60°, rapidez constante). Da control al jugador.
- **No:** solo invertir `vy` como el original. El ángulo no cambia en toda la partida.
- **Yes:** pelota pegada a la paleta hasta lanzar con `Space` o clic, al empezar, por nivel y tras perder vida. Evita perder vidas en cadena.
- **No:** estado `dead` con auto-lanzamiento, ni relanzamiento instantáneo del original.
- **Yes:** multiplicador `min(1.1^(nivel − 1), 2.0)` con sub-pasos de ≤ 8 px. Conserva el +10 % del original y evita tunneling.
- **No:** velocidad fija desde el nivel 5 (poca progresión) ni sin tope (injugable hacia nivel 12–15).
- **Yes:** teclado + ratón; `Space` inicia, `mousedown` también lanza. El original usa ratón; el clic de inicio lo sigue haciendo el teclado por el overlay React.
- **No:** solo teclado, ni clic para iniciar desde `ready`.
- **Yes:** redibujo vectorial neón con explosión vectorial de 150 ms. Encaja con la plataforma y conserva el feedback de los 4 frames originales.
- **No:** copiar sprites a `public/games/bloque-buster/`, ni quitar la explosión.
- **No:** sonido, selector de nivel en pausa y pantallas de GAME OVER / victoria del original. El modal FIN DEL JUEGO y el overlay EN PAUSA son los de la plataforma.
- **Yes:** una sola fila MOVER con `←`, `→` y `RATÓN`. El overlay de `game-player.tsx` usa `action` como `key` de React; dos filas MOVER duplican la key y rompen "sin errores de consola".
- **No:** dos filas MOVER separadas, ni cambiar la `key` en `game-player.tsx` (fuera de alcance).
- **Yes:** paleta de 81 px como `game.js`. El código manda sobre el README (162 px).
- **Yes:** 7 colores de bloque con hex de tokens existentes (`red` → `--bronze`, `hotpink` → `--ink`, `gray` → `--silver`). Sin tokens nuevos; filas contiguas distinguibles.
- **Yes:** niveles en `lib/engines/breakout-levels.ts` aparte del motor. Datos separados de lógica, como `levels.js`.
- **Yes:** reutilizar `EngineEntry`, `statsEqual` y el HUD de SPEC 07 sin tocarlos.
- **Yes:** leaderboard sin cambios: hereda SPEC 06 al marcar `playable = true`.
- **Yes:** la migración es el último paso. `bloque-buster` no acepta puntajes hasta que el motor está completo.

## Risks

| Risk                                                                  | Mitigation                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| La pelota atraviesa bloques a alta velocidad                          | Sub-pasos de ≤ 8 px y tope ×2,0; criterio explícito en nivel 9+.              |
| El `Space` de inicio también lanza la pelota                          | La transición `ready → playing` consume el evento; criterio explícito.        |
| Ángulo casi horizontal deja la pelota rebotando entre paredes sin fin | Ángulo máximo 60° desde la vertical; el saque usa 33,7°.                      |
| Listeners de ratón quedan vivos tras salir                            | Se registran en el canvas y se retiran en `destroy()`; criterio de regresión. |
| Caché del catálogo no ve la migración en dev                          | Reiniciar `npm run dev`; documentado en el paso 10.                           |
| Puntaje supera `SCORE_MAX`                                            | `Math.min(score, SCORE_MAX)` en el motor.                                     |

## What is **not** in this spec

- Táctil / móvil.
- Sonido y sprites del original.
- Selector de nivel y pantalla de victoria del original.
- Power-ups, bloques multigolpe, vidas extra.
- Cambios de textos o cover de `bloque-buster`.
- Cambios en el reproductor o el HUD.
- Anti-trampas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
