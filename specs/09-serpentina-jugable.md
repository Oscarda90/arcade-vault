# SPEC 09 — SERPENTINA jugable: juego de serpiente original en la plataforma

> **Status:** Aprobado
> **Depends on:** SPEC 05, SPEC 06, SPEC 07
> **Date:** 2026-11-25
> **Objective:** Crear un motor TypeScript en canvas de serpiente sobre rejilla que convierta el juego mock `serpentina` en jugable con leaderboard real, con frutas neón vectoriales, una sola vida y velocidad creciente por nivel.

## Por qué existe este spec

`serpentina` es hoy una partida simulada. Este spec la convierte en el cuarto juego real. No hay código de referencia: es un diseño original de las mecánicas clásicas de serpiente. Las frutas se inspiran en `references/source-assets/snake-assets/fruits.png`, pero se redibujan en vectorial neón porque ese PNG procede de un juego comercial. Reutiliza el HUD y el registro genéricos de SPEC 07, así que no toca `components/game-player.tsx` ni `lib/engines/types.ts`.

## Scope

**In:**

- Motor original en TypeScript estricto en `lib/engines/snake.ts` (`createSnake`), sin globals, siguiendo la estructura de `lib/engines/asteroids.ts`, `lib/engines/tetris.ts` y `lib/engines/breakout.ts`.
- Rejilla de 32 × 24 celdas de 25 px que ocupa el lienzo lógico 800 × 600.
- Serpiente inicial de 3 celdas en el centro mirando a la derecha.
- Movimiento por ticks de rejilla; intervalo `max(60, 150 − (nivel − 1) × 10)` ms.
- Giros con flechas y WASD, con cola de hasta 2 giros por tick; el giro de 180° se ignora.
- Fruta: aparece en una celda libre al azar; comerla suma `10 × nivel` y alarga la serpiente 1 celda.
- Nivel: `floor(frutas / 5) + 1`, sin nivel máximo.
- 5 tipos de fruta vectorial neón, solo cosméticos: cereza, limón, manzana, uva, sandía.
- Una sola vida: chocar con el borde o con el propio cuerpo → `gameover` + `onGameOver(score)`.
- Victoria: si no queda celda libre para la fruta nueva → `gameover` + `onGameOver(score)`.
- Recolor con hex de `app/globals.css` (tabla en Data model).
- HUD React: JUGADOR · PUNTUACIÓN · NIVEL · LONGITUD. Sin VIDAS.
- Overlay de inicio "PULSA ESPACIO PARA EMPEZAR" + tabla de controles de SERPENTINA; estado `ready` con la serpiente estática y la primera fruta visible.
- Pausa con botón, `P`, `Escape` y auto-pausa por visibilidad.
- Registro `serpentina` en `lib/engines/registry.ts`.
- Migración `supabase/migrations/<ts>_serpentina_playable.sql`: `playable = true` y `long` ajustado a frutas. Título, `short`, cover, color y orden sin cambios.

**Out of scope (for future specs):**

- Copiar `fruits.png` o usar `sprites.js` (assets de terceros; ver Decisions).
- Fruta bonus temporal, frutas con puntos distintos, power-ups.
- Bordes que se atraviesan (wrap-around), obstáculos internos, mapas.
- Varias vidas.
- Attract mode en `ready`.
- Controles táctiles / móvil jugable.
- Sonido.
- Cambiar `title`, `short`, `cover`, `color` o `sort_order` de `serpentina`.
- Cambios en `components/game-player.tsx`, `lib/engines/types.ts` o el HUD (ya genéricos desde SPEC 07).
- Anti-trampas / validación server-side de partidas.
- Cambios en leaderboard, Salón o `submitScore` (ya genéricos desde SPEC 06).
- Modificar `references/source-assets/snake-assets/`.
- Tests automatizados (no hay test runner configurado).

## Data model

No introduce tablas, columnas ni tipos nuevos. Reutiliza `EngineStats`, `EngineEntry` y `statsEqual` de SPEC 07. Cambia una fila de `public.games`.

### Registro

```ts
// lib/engines/registry.ts — entrada nueva
serpentina: {
  factory: createSnake,
  startLabel: "PULSA ESPACIO PARA EMPEZAR",
  controls: [
    { keys: ["←", "↑", "→", "↓", "WASD"], action: "GIRAR" },
    { keys: ["P", "ESC"], action: "PAUSA" },
  ],
  initialStats: {
    score: 0,
    level: 1,
    extras: [{ key: "length", label: "Longitud", value: "3" }],
  },
},
```

Stats emitidas: `{ score, level, extras: [{ key: "length", label: "Longitud", value: String(snake.length) }] }`, solo cuando `statsEqual` es falso.

### Estado interno del motor

```ts
type Dir = 'up' | 'down' | 'left' | 'right';
type FruitKind = 'cherry' | 'lemon' | 'apple' | 'grape' | 'melon';
interface Cell {
  x: number;
  y: number;
} // columna 0–31, fila 0–23; origen arriba-izquierda

// dentro de la closure de createSnake
let snake: Cell[]; // snake[0] = cabeza
let dir: Dir; // dirección del último tick
let turnQueue: Dir[]; // máx. 2 giros pendientes
let fruit: { cell: Cell; kind: FruitKind } | null;
let fruits: number; // frutas comidas en la partida
let score: number;
let level: number;
let tickAccum: number; // ms acumulados hacia el siguiente tick
```

### Motor `lib/engines/snake.ts`

| Constante         | Valor                                                                 | Origen   |
| ----------------- | --------------------------------------------------------------------- | -------- |
| Lienzo lógico     | 800 × 600                                                             | SPEC 05  |
| `COLS` × `ROWS`   | 32 × 24                                                               | decisión |
| `CELL`            | 25 px                                                                 | decisión |
| Serpiente inicial | `[(16,12), (15,12), (14,12)]`, `dir = "right"`                        | decisión |
| Intervalo de tick | `max(60, 150 − (nivel − 1) × 10)` ms; tope de 60 ms desde el nivel 10 | decisión |
| Nivel             | `floor(frutas / 5) + 1`                                               | decisión |
| Puntos por fruta  | `10 × nivel` (nivel antes de sumar la fruta)                          | decisión |
| Crecimiento       | +1 celda por fruta: ese tick no se retira la cola                     | decisión |
| Cola de giros     | máx. 2                                                                | decisión |
| Sorteo de fruta   | celda uniforme entre las libres; tipo uniforme entre los 5            | decisión |
| `dt` máximo       | 50 ms                                                                 | SPEC 05  |
| Score máximo      | `Math.min(score, SCORE_MAX)`                                          | SPEC 06  |

Tick: `tickAccum += dt`. Mientras `tickAccum ≥ intervalo`, se resta el intervalo y se avanza un paso. Con `dt` ≤ 50 ms y un intervalo ≥ 60 ms, hay como mucho un paso por frame.

Paso:

1. Si `turnQueue` no está vacía, `dir = turnQueue.shift()`.
2. Nueva cabeza = cabeza + `dir`.
3. Si la nueva cabeza está fuera de `0..31 × 0..23` → fin.
4. `grow` = la nueva cabeza coincide con la fruta.
5. Si la nueva cabeza coincide con un segmento del cuerpo → fin. Si `grow` es falso, la cola actual no cuenta porque se retira en este mismo paso.
6. Se añade la cabeza; si `grow` es falso, se retira la cola.
7. Si `grow`: `score += 10 × nivel`, `fruits += 1`, `level = floor(fruits / 5) + 1`, fruta nueva en celda libre. Si no hay celda libre → fin por victoria.

Giros: `keydown` de dirección compara con el último elemento de `turnQueue` (o con `dir` si está vacía). Si es igual u opuesta se ignora. Si la cola tiene 2 elementos se ignora. Si no, se encola. Los giros solo se aceptan en `playing`.

Estados: `ready` → (`Space`) → `playing` ⇄ `paused` → `gameover`. No usa `dead`. En `ready` la serpiente está estática y la primera fruta ya está visible. `Space` en `playing` no hace nada. `restart()` va directo a `playing` con serpiente inicial, fruta nueva, score 0, nivel 1, longitud 3 y cola de giros vacía.

Fin: al chocar se conserva el último frame. La cabeza se dibuja en magenta. Se llama `onGameOver(score)` una sola vez.

Paleta (hex de los tokens de `app/globals.css`):

| Elemento        | Color                                                   |
| --------------- | ------------------------------------------------------- |
| Cabeza          | cyan `#00f5ff` (`--cyan`) con glow                      |
| Cabeza al morir | magenta `#ff006e` (`--magenta`) con glow                |
| Cuerpo          | verde `#00ff88` (`--green`), sin glow                   |
| Cereza          | magenta `#ff006e` (`--magenta`), rabito verde `#00ff88` |
| Limón           | amarillo `#f5ff00` (`--yellow`)                         |
| Manzana         | verde `#00ff88` (`--green`), hoja cyan `#00f5ff`        |
| Uva             | cyan `#00f5ff` (`--cyan`)                               |
| Sandía          | bronce `#d97a3a` (`--bronze`), corteza verde `#00ff88`  |
| Marco (bordes)  | magenta `#ff006e` (`--magenta`), 2 px, con glow         |
| Rejilla         | `rgba(230, 233, 255, 0.04)`                             |
| Fondo           | `#000`                                                  |

Segmentos: cuadrado de 21 × 21 (2 px de margen dentro de la celda). Cabeza con dos ojos de 3 × 3 px `#000` orientados según `dir`.

Frutas (vectoriales, dentro de la celda de 25 px, con glow de su color):

- Cereza: dos círculos de radio 5 unidos por un rabito en V.
- Limón: elipse 9 × 6 con dos puntas.
- Manzana: círculo de radio 8 con hoja en la parte superior.
- Uva: racimo de 6 círculos de radio 3,5 en triángulo invertido.
- Sandía: media luna (semicírculo de radio 9) con corteza verde de 2 px.

Teclas: `ArrowUp`/`KeyW`, `ArrowDown`/`KeyS`, `ArrowLeft`/`KeyA`, `ArrowRight`/`KeyD` giran. `Space` empieza en `ready`. `KeyP`/`Escape` pausa (ignorando `e.repeat`). Las teclas de dirección ignoran `e.repeat`.

Puntuación: fruta = `10 × nivel`. Nivel 1 completo (5 frutas) = 50. Llegar a nivel 3 (10 frutas) = 150. Con 765 frutas como máximo teórico el score ronda 590 000, muy por debajo de `SCORE_MAX`.

### Catálogo

```sql
-- supabase/migrations/<ts>_serpentina_playable.sql
update public.games
set playable = true,
    long = 'Una serpiente de luz recorre la grilla buscando frutas de neón. Cada bocado la alarga y la hace más veloz. Un choque contra el muro o un movimiento en falso y se devora a sí misma.'
where id = 'serpentina';
```

## Estructura de archivos

```
lib/engines/snake.ts            # NUEVO: createSnake(canvas, cb)
lib/engines/registry.ts         # MODIFICA: registra serpentina
supabase/migrations/<ts>_serpentina_playable.sql  # NUEVO
```

`components/game-player.tsx`, `components/game-canvas.tsx`, `lib/engines/types.ts`, `app/globals.css` y `app/juegos/[id]/jugar/page.tsx` no cambian. No se crea `public/games/serpentina/`.

## Implementation plan

1. Releer `lib/engines/tetris.ts`, `lib/engines/breakout.ts` y `lib/engines/stats.ts` como referencia de estructura. Consultar `node_modules/next/dist/docs/01-app/` solo si surge algo de framework.
2. Crear `lib/engines/snake.ts`: factory con escalado `devicePixelRatio`, loop rAF con `dt` ≤ 50 ms, estado `ready` dibujando marco, rejilla, serpiente inicial y una fruta (dibujada como cuadrado provisional), `destroy()` idempotente. Registrar `serpentina`. Verificar: `/juegos/serpentina/jugar` muestra la escena y el overlay con las filas GIRAR y PAUSA (modal aún en modo demo).
3. Movimiento: `Space` en `ready` → `playing`, tick con `tickAccum`, avance en `dir`, cola de giros con flechas y WASD (ignora igual, opuesta y cola llena). Listeners `keydown`/`keyup` en `window`, ignorar `input`/`textarea`/contenteditable, `preventDefault` en las teclas del juego fuera de `gameover`. Verificar: la serpiente avanza y gira; ↑ → rápido desde dirección izquierda no la invierte.
4. Fruta y progresión: sorteo entre celdas libres, crecimiento, `10 × nivel`, nivel cada 5 frutas, intervalo por nivel, `onStats` con `statsEqual`, `Math.min` con `SCORE_MAX`. Verificar: HUD actualiza PUNTUACIÓN, NIVEL y LONGITUD.
5. Fin de partida: choque con borde, choque con cuerpo (excluyendo la cola que se retira), victoria sin celdas libres; cabeza magenta y `onGameOver(score)` una sola vez. Verificar: chocar abre el modal con la puntuación real.
6. Dibujo final: 5 frutas vectoriales, ojos de la cabeza, glow en cabeza, fruta y marco, paleta de la tabla. Verificar: colores y nitidez con DPR 2.
7. Ciclo de vida: `pause`/`resume` (P, Escape, botón) vaciando `turnQueue` y teclas pulsadas, `visibilitychange` → `pause()` si `playing`, `end()` → `gameover` + `onGameOver(score)` una sola vez, `restart()`. Verificar: salir y volver no duplica rAF ni listeners; `npm run lint` y `npm run build` pasan.
8. `npx supabase migration new serpentina_playable` con el SQL del Data model; `npm run db:push`; MCP `execute_sql` (`select id, playable, long from public.games where id = 'serpentina'`) y `get_advisors` (security); reiniciar `npm run dev` (caché `"use cache"` del catálogo). Verificar: con sesión, GUARDAR en `/juegos/serpentina/jugar` y el puntaje aparece en `/juegos/serpentina` y `/salon`.

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `npm run db:push` no reporta cambios pendientes; la fila `serpentina` de `public.games` tiene `playable = true`, el `long` nuevo y el resto de columnas sin cambios.
- [ ] `get_advisors` (security) sin avisos nuevos.
- [ ] `git diff main -- components/game-player.tsx lib/engines/types.ts app/globals.css` está vacío.
- [ ] No existe `public/games/serpentina/` y ningún archivo de `lib/` referencia `fruits.png` ni `sprites.js`.
- [ ] `/juegos/serpentina/jugar` muestra en el CRT el marco magenta, la rejilla, la serpiente de 3 celdas en el centro mirando a la derecha y una fruta, y el overlay "PULSA ESPACIO PARA EMPEZAR" con las filas GIRAR y PAUSA.
- [ ] Espacio arranca la partida y la serpiente avanza hacia la derecha.
- [ ] Flechas y WASD giran la serpiente.
- [ ] Pulsar la dirección opuesta a la actual no hace nada.
- [ ] Desde dirección derecha, pulsar ↑ y ← dentro del mismo tick hace dos giros en ticks consecutivos sin morder el cuello.
- [ ] Comer una fruta en nivel 1 suma 10 y LONGITUD sube 1; en nivel 2 suma 20.
- [ ] Al comer la 5.ª fruta NIVEL pasa a 02 y la serpiente avanza visiblemente más rápido (140 ms por celda).
- [ ] En nivel 10 o superior el tick es de 60 ms.
- [ ] La fruta nueva nunca aparece sobre la serpiente.
- [ ] Aparecen los 5 tipos de fruta (cereza, limón, manzana, uva, sandía) a lo largo de una partida.
- [ ] Chocar con el borde abre el modal FIN DEL JUEGO con la puntuación real y la cabeza queda en magenta.
- [ ] Chocar con el propio cuerpo abre el modal FIN DEL JUEGO con la puntuación real.
- [ ] Avanzar hacia la celda que ocupa la cola en ese momento (sin comer) no termina la partida.
- [ ] El HUD muestra JUGADOR, PUNTUACIÓN, NIVEL y LONGITUD, no muestra VIDAS, y se actualiza durante la partida.
- [ ] JUGAR DE NUEVO deja la serpiente inicial, PUNTUACIÓN 0, NIVEL 01, LONGITUD 3, jugando inmediatamente.
- [ ] PAUSA, `P` y `Escape` congelan la serpiente y muestran "EN PAUSA"; REANUDAR / `P` / `Escape` la continúan; cambiar de pestaña deja el juego en pausa.
- [ ] Un giro pulsado durante la pausa no se aplica al reanudar.
- [ ] FIN durante la partida abre el modal con la puntuación actual.
- [ ] Las teclas del juego no hacen scroll ni reactivan botones con foco.
- [ ] Salir y volver a entrar no duplica la velocidad de la serpiente, rAF ni listeners.
- [ ] Con sesión, GUARDAR deja una fila en `scores` con `game_id = 'serpentina'` y el puntaje aparece en `/juegos/serpentina` (leaderboard, PARTIDAS, MEJOR GLOBAL) y en `/salon` pestaña SERPENTINA sin reiniciar el servidor.
- [ ] `/juegos/serpentina` muestra el `long` nuevo con "frutas de neón".
- [ ] Invitado ve "INICIA SESIÓN PARA COMPETIR" y no puede guardar.
- [ ] `/juegos/rocas/jugar`, `/juegos/caida/jugar` y `/juegos/bloque-buster/jugar` se ven y juegan igual que antes.
- [ ] Un juego no jugable (p.ej. `/juegos/gloton/jugar`) sigue mostrando el simulador y "PARTIDA DEMO · NO PUNTÚA".
- [ ] En viewport táctil emulado el overlay muestra "REQUIERE TECLADO".
- [ ] El canvas se ve nítido con `devicePixelRatio` 2.
- [ ] Sin errores de hidratación ni de consola en `/juegos/serpentina/jugar`.
- [ ] `references/source-assets/snake-assets/` sin cambios.

## Decisions

- **Yes:** reusar el mock `serpentina` con `playable = true` y `long` ajustado a frutas. Se mantienen URL, `cover-snake`, color verde y orden.
- **No:** dejar el `long` con "núcleos magenta" (no coincide con las frutas) ni crear una entrada nueva (duplicaría el juego).
- **Yes:** frutas redibujadas en vectorial neón, inspiradas en `fruits.png`. Encaja con la plataforma y cumple la regla de no usar sprites de juegos comerciales.
- **No:** copiar `fruits.png` a `public/games/serpentina/`. Según `sprites.js` procede de un juego comercial (spriters-resource). Además, las etiquetas de `sprites.js` no coinciden con las imágenes del PNG.
- **No:** un único núcleo magenta como comida. Las frutas dan variedad visual sin coste de reglas.
- **Yes:** 5 tipos de fruta solo cosméticos, todos con el mismo valor. Mantiene la puntuación simple y predecible.
- **No:** fruta bonus temporal ni puntos por tipo. Añaden temporizadores y criterios; irían en otro spec.
- **Yes:** rejilla 32 × 24 de 25 px y muro que mata. Llena exactamente 800 × 600 y es la regla clásica.
- **No:** wrap-around ni rejilla 40 × 30 de 20 px.
- **Yes:** `10 × nivel` por fruta, nivel cada 5 frutas, tick `max(60, 150 − (nivel − 1) × 10)` ms, una vida. Premia avanzar y encaja con "cada bocado la hace más veloz".
- **No:** 10 fijos con aceleración por fruta sin niveles, ni varias vidas.
- **Yes:** flechas + WASD con cola de 2 giros. Dos pulsaciones rápidas no se pierden y comparar con el último giro encolado evita invertirse.
- **No:** solo flechas, ni un único giro por tick.
- **Yes:** HUD NIVEL + LONGITUD, sin VIDAS. Una sola vida hace inútil el contador.
- **No:** extra FRUTAS ni solo NIVEL.
- **Yes:** `ready` con serpiente estática y primera fruta visible. Simple; el overlay ya da el foco visual.
- **No:** attract mode.
- **Yes:** victoria al llenar la rejilla termina la partida con `onGameOver(score)`. Caso casi imposible, pero el sorteo de fruta necesita una salida definida.
- **Yes:** sorteo de fruta sobre la lista de celdas libres, no por reintentos. Tiempo acotado con la serpiente muy larga.
- **Yes:** una sola fila GIRAR con flechas y `WASD`. El overlay usa `action` como `key` de React; dos filas GIRAR duplicarían la key (lección de SPEC 08).
- **Yes:** reutilizar `EngineEntry`, `statsEqual` y el HUD de SPEC 07 sin tocarlos.
- **No:** sonido ni táctil. Van en su propio spec.
- **Yes:** leaderboard sin cambios: hereda SPEC 06 al marcar `playable = true`.
- **Yes:** la migración es el último paso. `serpentina` no acepta puntajes hasta que el motor está completo.

## Risks

| Risk                                                     | Mitigation                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dos giros rápidos invierten la serpiente sobre su cuello | Cada giro se compara con el último encolado, no con `dir`; criterio explícito.      |
| Muerte falsa al perseguir la propia cola                 | La cola que se retira en el mismo paso no cuenta como colisión; criterio explícito. |
| Sorteo de fruta lento con la serpiente muy larga         | Elegir entre la lista de celdas libres; victoria si está vacía.                     |
| Varios pasos por frame tras un `dt` grande               | `dt` ≤ 50 ms y tick mínimo de 60 ms: como mucho un paso por frame.                  |
| Giros encolados antes de pausar se aplican al reanudar   | `resume()` y `restart()` vacían `turnQueue`; criterio explícito.                    |
| Caché del catálogo no ve la migración en dev             | Reiniciar `npm run dev`; documentado en el paso 8.                                  |
| Puntaje supera `SCORE_MAX`                               | Imposible en la práctica (~590 000 máx.); `Math.min(score, SCORE_MAX)` igualmente.  |

## What is **not** in this spec

- Sprites o atlas de `references/source-assets/snake-assets/`.
- Fruta bonus, puntos por tipo de fruta, power-ups.
- Wrap-around, obstáculos, mapas, varias vidas.
- Attract mode.
- Táctil / móvil.
- Sonido.
- Cambios de título, `short` o cover de `serpentina`.
- Cambios en el reproductor o el HUD.
- Anti-trampas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
