# SPEC 07 — CAÍDA jugable: port de Tetris a la plataforma

> **Status:** Implementado
> **Depends on:** SPEC 05, SPEC 06
> **Date:** 2026-11-25
> **Objective:** Portar `references/started-games/03-tetris/game.js` a un motor TypeScript en canvas que convierta el juego mock `caida` en jugable con leaderboard real, generalizando el HUD y el registro de motores para juegos sin vidas.

## Por qué existe este spec

`caida` es hoy una partida simulada. Este spec la convierte en el segundo juego real, portado desde la referencia de Tetris. Es el primer juego **sin vidas** y con una stat propia (LÍNEAS), así que fija la convención de **HUD y overlay de inicio genéricos**: cada motor declara sus stats, sus controles y su texto de inicio en el registro. ROCAS migra a ese contrato sin cambios visibles y Arkanoid lo reutilizará.

## Scope

**In:**

- Generalización de `EngineStats` (`lives`/`level` opcionales + `extras`) y del registro (`EngineEntry` con `factory`, `startLabel`, `controls`, `initialStats`).
- `components/game-player.tsx`: HUD, overlay de inicio y stats iniciales salen del `EngineEntry`; sin texto ni tabla hardcodeados para ROCAS.
- ROCAS migra su `powerUp` a un extra `3X` y su tabla de controles al registro; se ve y juega igual que antes.
- Port de `game.js` a TypeScript estricto en `lib/engines/tetris.ts` (`createTetris`), sin globals, siguiendo la estructura de `lib/engines/asteroids.ts`.
- Mecánicas idénticas al código original: tablero 10×20, **8 piezas** (las 7 estándar + la "tuerca" 3×3 hueca), sorteo uniforme 1/8, rotación horaria con wall kicks `[0, -1, 1, -2, 2]`, soft drop, hard drop, pieza fantasma, preview de la siguiente pieza, sin lock delay, sin hold.
- Puntuación del original: `[0, 100, 300, 500, 800] × nivel` por líneas, soft drop +1 por fila, hard drop +2 por celda recorrida.
- Progresión: `nivel = floor(líneas / 10) + 1`, intervalo de caída `max(100, 1000 − (nivel − 1) × 90)` ms, sin nivel máximo.
- Fin de partida: la pieza nueva colisiona al aparecer → `gameover` + `onGameOver(score)`.
- Lienzo lógico 800×600: tablero de celdas de 28 px centrado y caja SIGUIENTE a la derecha, dibujados en canvas.
- Recolor con hex de `app/globals.css` (tabla en Data model).
- HUD React: JUGADOR · PUNTUACIÓN · NIVEL · LÍNEAS. Sin VIDAS.
- Overlay de inicio "PULSA ESPACIO PARA EMPEZAR" + tabla de controles de CAÍDA; estado `ready` con tablero vacío y rejilla.
- Pausa con botón, `P`, `Escape` y auto-pausa por visibilidad.
- Registro `caida` en `lib/engines/registry.ts`.
- Migración `supabase/migrations/<ts>_caida_playable.sql`: `playable = true`. Título, textos, cover, color y orden sin cambios.

**Out of scope (for future specs):**

- Controles táctiles / móvil jugable.
- Sonido.
- Hold, bolsa 7-bag, lock delay, T-spins, combos, DAS propio, animación de línea limpiada.
- Selector de tema claro/oscuro del original (`theme-toggle`, `localStorage tetris-theme`).
- Cambiar `title`, `short`, `long`, `cover` o `color` de `caida`.
- Anti-trampas / validación server-side de partidas.
- Cambios en leaderboard, Salón o `submitScore` (ya genéricos desde SPEC 06).
- Modificar `references/started-games/03-tetris/`.
- Tests automatizados (no hay test runner configurado).

## Data model

No introduce tablas ni columnas. Cambia tipos TypeScript y una fila de `public.games`.

### Contrato de motor generalizado

```ts
// lib/engines/types.ts
export type EngineState = 'ready' | 'playing' | 'dead' | 'paused' | 'gameover'; // sin cambios

export interface HudExtra {
  key: string; // estable, para React: "lines", "3x"
  label: string; // "Líneas", "3X"
  value: string; // ya formateado: "12", "4.2s"
  tone?: 'magenta' | 'yellow' | 'green'; // omitido → cyan (color por defecto de .hud-stat .v)
}

export interface EngineStats {
  score: number;
  lives?: number; // omitido → el HUD no muestra VIDAS
  level?: number; // omitido → el HUD no muestra NIVEL
  extras?: HudExtra[]; // en orden, después de NIVEL
}
// EngineCallbacks, GameEngine y EngineFactory sin cambios.
```

```ts
// lib/engines/stats.ts — NUEVO
export function statsEqual(a: EngineStats | null, b: EngineStats): boolean;
// compara score, lives, level y extras (longitud + key/label/value/tone en orden)
```

```ts
// lib/engines/registry.ts
export interface EngineEntry {
  factory: EngineFactory;
  startLabel: string;
  controls: { keys: string[]; action: string }[];
  initialStats: EngineStats;
}
export const ENGINES: Partial<Record<string, EngineEntry>> = {
  rocas: {
    factory: createAsteroids,
    startLabel: 'PULSA ESPACIO PARA EMPEZAR',
    controls: [
      { keys: ['←', '→'], action: 'ROTAR' },
      { keys: ['↑'], action: 'PROPULSAR' },
      { keys: ['ESPACIO'], action: 'DISPARAR' },
      { keys: ['P', 'ESC'], action: 'PAUSA' },
    ],
    initialStats: { score: 0, lives: 3, level: 1, extras: [] },
  },
  caida: {
    factory: createTetris,
    startLabel: 'PULSA ESPACIO PARA EMPEZAR',
    controls: [
      { keys: ['←', '→'], action: 'MOVER' },
      { keys: ['↑', 'X'], action: 'ROTAR' },
      { keys: ['↓'], action: 'BAJAR' },
      { keys: ['ESPACIO'], action: 'CAÍDA' },
      { keys: ['P', 'ESC'], action: 'PAUSA' },
    ],
    initialStats: {
      score: 0,
      level: 1,
      extras: [{ key: 'lines', label: 'Líneas', value: '0' }],
    },
  },
};
export function getEngine(id: string): EngineEntry | undefined;
```

ROCAS: `powerUp > 0` → `extras: [{ key: "3x", label: "3X", value: "4.2s", tone: "green" }]` (segundos con 1 decimal); `powerUp = 0` → `extras: []`.

HUD (`HudStats`): JUGADOR · PUNTUACIÓN · VIDAS (solo si `lives` definido) · NIVEL (solo si `level` definido) · cada extra como `.hud-stat` con clase `tone-<tone>`. La regla `.hud-stat.power` de `app/globals.css` pasa a `.hud-stat.tone-green` con los mismos valores; se añaden `tone-magenta` y `tone-yellow`. El simulador sigue pasando `lives`/`level` y se ve igual.

### Motor `lib/engines/tetris.ts`

| Constante          | Valor                                                               | Origen                 |
| ------------------ | ------------------------------------------------------------------- | ---------------------- |
| `COLS` × `ROWS`    | 10 × 20                                                             | `game.js`              |
| `BLOCK`            | 28 px                                                               | decisión (original 30) |
| Origen del tablero | (260, 20); tablero 280×560                                          | decisión               |
| Caja SIGUIENTE     | 4×4 celdas de 28 px en (580, 60); etiqueta "SIGUIENTE" en (580, 44) | decisión               |
| `PIECES`           | I, O, T, S, Z, J, L, tuerca `[[8,8,8],[8,0,8],[8,8,8]]`             | `game.js`              |
| Sorteo             | `floor(random × 8) + 1`                                             | `game.js`              |
| Spawn              | `x = floor(COLS/2) − floor(ancho/2)`, `y = 0`                       | `game.js`              |
| Wall kicks         | `[0, -1, 1, -2, 2]` columnas                                        | `game.js`              |
| `LINE_SCORES`      | `[0, 100, 300, 500, 800]` × nivel                                   | `game.js`              |
| Soft drop          | +1 por fila; si no puede bajar, fija la pieza                       | `game.js`              |
| Hard drop          | +2 × filas recorridas, fija la pieza                                | `game.js`              |
| Intervalo de caída | `max(100, 1000 − (nivel − 1) × 90)` ms; `dropAccum = 0` al bajar    | `game.js`              |
| Nivel              | `floor(líneas / 10) + 1`                                            | `game.js`              |
| `dt` máximo        | 50 ms                                                               | SPEC 05                |
| Score máximo       | `Math.min(score, SCORE_MAX)`                                        | SPEC 06                |

Estados: `ready` → (`Space`) → `playing` ⇄ `paused` → `gameover`. No usa `dead`. `restart()` va directo a `playing` con tablero vacío, score 0, líneas 0, nivel 1.

Paleta (hex de los tokens de `app/globals.css`):

| Elemento                         | Color                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| I                                | cyan `#00f5ff` (`--cyan`)                                                                      |
| O                                | amarillo `#f5ff00` (`--yellow`)                                                                |
| T                                | magenta `#ff006e` (`--magenta`)                                                                |
| S                                | verde `#00ff88` (`--green`)                                                                    |
| Z                                | bronce `#d97a3a` (`--bronze`)                                                                  |
| J                                | tinta `#e6e9ff` (`--ink`)                                                                      |
| L                                | oro `#ffcf3a` (`--gold`)                                                                       |
| Tuerca                           | plata `#c7d0e0` (`--silver`)                                                                   |
| Pieza fantasma                   | color de la pieza, `globalAlpha = 0.2`                                                         |
| Marco del tablero y de SIGUIENTE | magenta `#ff006e` con glow                                                                     |
| Rejilla                          | `rgba(230, 233, 255, 0.06)`                                                                    |
| Etiqueta SIGUIENTE               | `#8a8fb5` (`--ink-dim`), fuente leída de `--pixel` con `getComputedStyle` dentro de la factory |
| Fondo                            | `#000`                                                                                         |

Bloque: relleno del color con 1 px de separación y franja superior de 4 px `rgba(255,255,255,0.12)`, como el original. Glow (`shadowBlur`) solo en la pieza actual y los marcos; bloques fijados y fantasma sin glow.

Teclas: `ArrowLeft`/`ArrowRight` mover, `ArrowUp`/`KeyX` rotar, `ArrowDown` soft drop, `Space` empezar (en `ready`) o hard drop (en `playing`, ignorando `e.repeat`), `KeyP`/`Escape` pausa (ignorando `e.repeat`). Mover, rotar y soft drop usan el autorepeat del SO.

Stats emitidas: `{ score, level, extras: [{ key: "lines", label: "Líneas", value: String(lines) }] }`, solo cuando `statsEqual` es falso.

### Catálogo

```sql
-- supabase/migrations/<ts>_caida_playable.sql
update public.games
set playable = true
where id = 'caida';
```

## Estructura de archivos

```
lib/engines/types.ts            # MODIFICA: EngineStats generalizado + HudExtra
lib/engines/stats.ts            # NUEVO: statsEqual
lib/engines/registry.ts         # MODIFICA: EngineEntry; rocas migra; registra caida
lib/engines/asteroids.ts        # MODIFICA: powerUp → extras "3X"; usa statsEqual
lib/engines/tetris.ts           # NUEVO: createTetris(canvas, cb)
components/game-player.tsx      # MODIFICA: HudStats opcional + extras; overlay e initialStats desde EngineEntry
app/globals.css                 # MODIFICA: .hud-stat.power → .hud-stat.tone-green; añade tone-magenta, tone-yellow
supabase/migrations/<ts>_caida_playable.sql  # NUEVO
```

`components/game-canvas.tsx` y `app/juegos/[id]/jugar/page.tsx` no cambian: `GameCanvas` sigue recibiendo una `EngineFactory`.

## Implementation plan

1. Leer `node_modules/next/dist/docs/01-app/` (client components) y releer `lib/engines/asteroids.ts` y `components/game-canvas.tsx` como referencia de estructura.
2. Generalizar el HUD: `types.ts` (`HudExtra`, `EngineStats` opcional), crear `stats.ts`, migrar `asteroids.ts` (`powerUp` → `extras`, `emitStats` con `statsEqual`), `HudStats` con `lives`/`level` opcionales y extras, CSS `.tone-*`. Verificar: `/juegos/rocas/jugar` muestra el mismo HUD y la stat 3X verde; `npm run build` pasa.
3. Generalizar el registro: `EngineEntry` en `registry.ts` con la entrada `rocas`; `GamePlayer` usa `getEngine(game.id)?.factory`; `EnginePlayer` recibe el `entry` y pinta `startLabel`, la tabla desde `controls` y arranca con `initialStats` (también en JUGAR DE NUEVO). Verificar: overlay de ROCAS idéntico; `npm run build` pasa.
4. Crear `lib/engines/tetris.ts`: factory con escalado `devicePixelRatio`, loop rAF con `dt` ≤ 50 ms, estado `ready` dibujando marco, rejilla y caja SIGUIENTE vacía, `destroy()` idempotente. Registrar `caida`. Verificar: `/juegos/caida/jugar` muestra el tablero y el overlay con los controles de CAÍDA (modal aún en modo demo).
5. Mecánica base: `createBoard`, `randomPiece`, `collide`, `rotateCW`, `tryRotate`, `spawn`, gravedad por `dropInterval`, `merge`, `clearLines`, `lockPiece`, fin por colisión al aparecer. `Space` en `ready` → `playing`. Verificar: las piezas caen, se fijan, las líneas completas desaparecen y llenar el tablero abre el modal.
6. Input y puntuación: listeners `keydown`/`keyup` en `window`, ignorar `input`/`textarea`/contenteditable, `preventDefault` en las teclas del juego fuera de `gameover`; mover, rotar, soft drop, hard drop; tabla de puntos; nivel e intervalo; `onStats` con `statsEqual`; `Math.min` con `SCORE_MAX`. Verificar: HUD actualiza PUNTUACIÓN, NIVEL y LÍNEAS.
7. Dibujo final: pieza fantasma, pieza actual con glow, preview centrada en la caja con el offset `floor((4 − ancho) / 2)` del original, paleta de la tabla. Verificar: colores y nitidez con DPR 2.
8. Ciclo de vida: `pause`/`resume` (P, Escape, botón), `visibilitychange` → `pause()` si `playing`, `end()` → `gameover` + `onGameOver(score)` una sola vez, `restart()`. Verificar: salir y volver no duplica rAF ni listeners; `npm run lint` y `npm run build` pasan.
9. `npx supabase migration new caida_playable` con el SQL del Data model; `npm run db:push`; MCP `execute_sql` (`select id, playable from public.games where id = 'caida'` → `true`) y `get_advisors` (security); reiniciar `npm run dev` (caché `"use cache"` del catálogo). Verificar: con sesión, GUARDAR en `/juegos/caida/jugar` y el puntaje aparece en `/juegos/caida` y `/salon`.

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `npm run db:push` no reporta cambios pendientes; la fila `caida` de `public.games` tiene `playable = true` y el resto de columnas sin cambios.
- [ ] `get_advisors` (security) sin avisos nuevos.
- [ ] `grep -n "PROPULSAR" components/game-player.tsx` no devuelve resultados.
- [ ] `/juegos/caida/jugar` muestra en el CRT el tablero vacío con marco magenta, rejilla y caja SIGUIENTE, y el overlay "PULSA ESPACIO PARA EMPEZAR" con las filas MOVER, ROTAR, BAJAR, CAÍDA y PAUSA.
- [ ] Espacio arranca la partida y no provoca un hard drop en ese mismo pulso.
- [ ] La caja SIGUIENTE muestra la pieza que aparece justo después de fijar la actual.
- [ ] ←/→ mueven una columna y no atraviesan paredes ni bloques; ↑ y X rotan en sentido horario.
- [ ] Rotar una I vertical pegada a la pared desplaza la pieza (wall kick) en vez de anular el giro.
- [ ] La pieza fantasma se ve al 20 % de opacidad en la fila donde aterrizaría.
- [ ] Cada pulsación de ↓ que baja una fila suma 1; Espacio suma 2 por fila recorrida y fija la pieza.
- [ ] Mantener Espacio pulsado fija una sola pieza.
- [ ] En nivel 1, limpiar 1 / 2 / 3 / 4 líneas a la vez suma 100 / 300 / 500 / 800; en nivel 2 suma el doble.
- [ ] Al llegar a 10 líneas NIVEL pasa a 02 y la caída se acelera (910 ms por fila).
- [ ] La tuerca (anillo 3×3 plata) aparece entre las piezas sorteadas.
- [ ] Cuando una pieza nueva colisiona al aparecer se abre el modal FIN DEL JUEGO con la puntuación real.
- [ ] El HUD muestra JUGADOR, PUNTUACIÓN, NIVEL y LÍNEAS, no muestra VIDAS, y se actualiza durante la partida.
- [ ] JUGAR DE NUEVO deja el tablero vacío, PUNTUACIÓN 0, NIVEL 01, LÍNEAS 0, jugando inmediatamente.
- [ ] PAUSA, `P` y `Escape` congelan la caída y muestran "EN PAUSA"; REANUDAR / `P` / `Escape` la continúan; cambiar de pestaña deja el juego en pausa.
- [ ] Durante la pausa las flechas no mueven la pieza.
- [ ] FIN durante la partida abre el modal con la puntuación actual.
- [ ] Las teclas del juego no hacen scroll ni reactivan botones con foco.
- [ ] Salir y volver a entrar no duplica la velocidad de caída, rAF ni listeners.
- [ ] Con sesión, GUARDAR deja una fila en `scores` con `game_id = 'caida'` y el puntaje aparece en `/juegos/caida` (leaderboard, PARTIDAS, MEJOR GLOBAL) y en `/salon` pestaña CAÍDA sin reiniciar el servidor.
- [ ] Invitado ve "INICIA SESIÓN PARA COMPETIR" y no puede guardar.
- [ ] `/juegos/rocas/jugar` se ve y juega igual que antes: mismo overlay y controles, HUD con VIDAS `♥`, NIVEL y stat 3X verde con cuenta regresiva.
- [ ] Un juego no jugable (p.ej. `/juegos/serpentina/jugar`) sigue mostrando el simulador con VIDAS y NIVEL, y "PARTIDA DEMO · NO PUNTÚA".
- [ ] En viewport táctil emulado el overlay muestra "REQUIERE TECLADO".
- [ ] El canvas se ve nítido con `devicePixelRatio` 2.
- [ ] Sin errores de hidratación ni de consola en `/juegos/caida/jugar`.
- [ ] `references/started-games/03-tetris/` sin cambios.

## Decisions

- **Yes:** reusar el mock `caida` tal cual (solo `playable = true`). Su `long` ya describe el juego ("cada 10 líneas") y se mantienen URL, cover y orden.
- **No:** ajustar `long` o crear una entrada nueva. Sin beneficio; una entrada nueva duplicaría el juego.
- **Yes:** mantener la pieza tuerca y el sorteo 1/8. El código es la fuente de verdad y da identidad propia a CAÍDA.
- **No:** solo las 7 piezas estándar del README.
- **Yes:** mecánicas idénticas al original. Port fiel, sin rediseño de jugabilidad.
- **No:** lock delay, hold, 7-bag, destello de línea. Cambian la sensación o amplían scope.
- **Yes:** contrato completo (`lives`/`level` opcionales, `extras`, `EngineEntry`). Arkanoid y siguientes solo añaden su entrada.
- **No:** generalización mínima (`lines?` en `EngineStats` + mapa de controles en `game-player.tsx`). El próximo juego volvería a tocar el reproductor.
- **Yes:** `statsEqual` compartido en `lib/engines/stats.ts`. Ambos motores comparan `extras` por valor y no re-renderizan cada frame.
- **Yes:** celdas de 28 px con márgenes y caja SIGUIENTE en canvas. Deja aire para el glow; la preview es elemento de juego, no HUD.
- **No:** celda 30 a alto completo (glow recortado) ni preview en el HUD React (más trabajo en React).
- **Yes:** 8 colores con hex de tokens existentes (`--cyan`, `--yellow`, `--magenta`, `--green`, `--bronze`, `--ink`, `--gold`, `--silver`). Piezas distinguibles sin tocar el sistema de diseño.
- **No:** 4 neón repetidos (piezas confundibles) ni tokens nuevos.
- **Yes:** teclas del original + `Escape`; Espacio ignora `e.repeat`. Evita fijar varias piezas por accidente.
- **No:** DAS propio. Más código; el original usa el autorepeat del SO.
- **Yes:** `ready` con tablero vacío y rejilla. Simple; el overlay ya da el foco visual.
- **No:** attract mode con piezas cayendo.
- **No:** HUD y overlays del original (`#overlay`, panel lateral DOM) y su `theme-toggle`. HUD y modal son los de la plataforma.
- **Yes:** redibujo vectorial; el original no tiene assets que copiar.
- **No:** sonido. El original no lo tiene.
- **Yes:** leaderboard sin cambios: hereda SPEC 06 al marcar `playable = true`.
- **Yes:** la migración es el último paso. `caida` no acepta puntajes hasta que el motor está completo.

## Risks

| Risk                                                                       | Mitigation                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Generalizar el HUD rompe ROCAS                                             | Pasos 2 y 3 propios con verificación de ROCAS antes de crear el motor nuevo; criterio de regresión explícito. |
| `extras` como array nuevo en cada frame dispara re-renders                 | `statsEqual` compara por valor antes de llamar `onStats`.                                                     |
| Espacio de inicio también ejecuta un hard drop                             | La transición `ready → playing` consume el evento; criterio explícito.                                        |
| La fuente de `next/font` tiene nombre con hash y el canvas no la encuentra | Leer `--pixel` con `getComputedStyle` dentro de la factory; fallback `monospace`.                             |
| Caché del catálogo no ve la migración en dev                               | Reiniciar `npm run dev`; documentado en el paso 9.                                                            |
| Puntaje supera `SCORE_MAX`                                                 | `Math.min(score, SCORE_MAX)` en el motor.                                                                     |

## What is **not** in this spec

- Táctil / móvil.
- Sonido.
- Hold, 7-bag, lock delay, T-spins, DAS propio, animación de línea.
- Selector de tema del original.
- Cambios de textos o cover de `caida`.
- Anti-trampas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
