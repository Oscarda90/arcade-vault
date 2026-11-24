# SPEC 05 — ROCAS jugable: port de Asteroids a la plataforma

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 02, SPEC 04
> **Date:** 2026-11-24
> **Objective:** Portar `references/started-games/02-asteroids/game.js` a un motor TypeScript en canvas que convierta el juego mock `rocas` en el primer juego realmente jugable de Arcade Vault, integrado con el HUD, la pausa y el modal de fin de partida existentes.

## Por qué existe este spec

Hasta ahora `/juegos/[id]/jugar` es una partida simulada (`components/game-player.tsx`: el puntaje sube solo cada 220 ms). Este es el primer juego real: fija la convención de **motores de juego** (interfaz común, registro `id → motor`, montaje en canvas desde un client component, ciclo de vida seguro con React) que reutilizarán Tetris y Arkanoid (`references/started-games/03-tetris`, `04-arkanoid`) en specs posteriores.

## Scope

**In:**

- Port de `game.js` a TypeScript estricto en `lib/engines/asteroids.ts`, sin globals ni acceso a `document.getElementById`: todo el estado vive dentro de la instancia creada por la factory.
- Mecánicas idénticas al original: rotación/propulsión/inercia/drag, espacio toroidal, 3 tamaños de asteroide que se parten (20/50/100 pts), 3 vidas, invencibilidad con parpadeo al reaparecer (3 s), espera de 2 s tras morir, niveles (`3 + nivel` asteroides grandes), zona segura de spawn, partículas de explosión, power-up triple disparo **3x** (15 % de drop, garantizado a los 5 kills, 1 por nivel, dura 5 s, TTL 12 s), cooldown de disparo 0.2 s, `dt` limitado a 50 ms.
- Recolor neón con los colores de la plataforma (ver Data model), con glow (`shadowBlur`). Misma geometría vectorial.
- Canvas lógico 800×600 escalado al `.crt-screen` existente (ya es 4:3), nítido con `devicePixelRatio`.
- Se elimina el HUD dibujado en canvas y el overlay GAME OVER del canvas: score/vidas/nivel/3x se muestran en el `player-hud` React existente; el fin de partida usa el modal FIN DEL JUEGO existente.
- Interfaz común de motor (`lib/engines/types.ts`) y registro `id → factory` (`lib/engines/registry.ts`) con una sola entrada: `rocas`.
- `components/game-player.tsx`: si el juego tiene motor registrado → partida real en canvas; si no → simulador actual sin cambios de comportamiento.
- Nuevo `components/game-canvas.tsx` (client) que crea el motor al montar y lo destruye al desmontar.
- Pantalla de inicio (overlay React en el CRT): "PULSA ESPACIO PARA EMPEZAR" + tabla de controles. Espacio arranca la partida.
- Pausa: botón PAUSA/REANUDAR, teclas `P` y `Escape`, y auto-pausa cuando la pestaña pierde visibilidad. Se reutiliza el overlay "EN PAUSA" existente.
- Botón FIN termina la partida en curso y abre el modal con el puntaje actual.
- "JUGAR DE NUEVO" reinicia el motor directamente en estado `playing`.
- Flechas y Espacio no hacen scroll de la página ni activan botones con foco mientras se juega; sí funcionan normalmente dentro de inputs (campo de nombre del modal).
- Aviso "REQUIERE TECLADO" en el overlay de inicio si el dispositivo no tiene puntero fino (`matchMedia("(any-pointer: fine)")` falso).
- Guardado de puntaje con `saveScore` de `useSession()` (localStorage `av_scores`), sin cambios.
- `lib/games.ts`: el texto `long` de `rocas` se ajusta a lo que el juego realmente tiene (quitar "OVNIs", mencionar el power-up 3x). id, título, cover, color y categoría no cambian.

**Out of scope (for future specs):**

- Controles táctiles / soporte móvil jugable.
- Sonido.
- OVNIs u otras mecánicas que el original no tiene.
- Puntajes en base de datos, Salón de la Fama real, récord real en la ficha (`best`/`plays` siguen mock).
- Port de Tetris y Arkanoid.
- Leaderboard por juego real en `/juegos/rocas` (sigue `seededScores`).
- Anti-trampas / validación de puntajes.
- Modificar los archivos de `references/started-games/02-asteroids/` (son solo referencia).
- Tests automatizados (no hay test runner configurado).

## Data model

No introduce datos persistentes nuevos. Introduce estas estructuras TypeScript:

```ts
// lib/engines/types.ts
export type EngineState = 'ready' | 'playing' | 'dead' | 'paused' | 'gameover';

export interface EngineStats {
  score: number;
  lives: number;
  level: number;
  /** segundos restantes de triple disparo, redondeado a 0.1; 0 = inactivo */
  powerUp: number;
}

export interface EngineCallbacks {
  /** solo se llama cuando algún valor cambia (no cada frame) */
  onStats: (stats: EngineStats) => void;
  onStateChange: (state: EngineState) => void;
  onGameOver: (finalScore: number) => void;
}

export interface GameEngine {
  pause(): void; // playing|dead → paused
  resume(): void; // paused → estado previo
  restart(): void; // cualquier estado → playing, stats iniciales
  end(): void; // termina ya → gameover + onGameOver(score)
  destroy(): void; // cancela rAF, quita listeners; idempotente
}

export type EngineFactory = (
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
) => GameEngine;
```

```ts
// lib/engines/registry.ts
export const ENGINES: Partial<Record<string, EngineFactory>> = {
  rocas: createAsteroids,
};
export function getEngine(id: string): EngineFactory | undefined;
```

Estado inicial tras crear el motor: `ready` (se dibuja el campo de asteroides en movimiento detrás del overlay; la nave no se controla). `Space` en `ready` → `playing`.

Paleta neón (constantes en `lib/engines/asteroids.ts`, mismos valores que los tokens de `app/globals.css`):

| Elemento            | Color                        |
| ------------------- | ---------------------------- |
| Nave                | cyan (`--cyan`)              |
| Llama del propulsor | amarillo (`--yellow`)        |
| Balas               | amarillo (`--yellow`)        |
| Asteroides          | magenta (`--magenta`)        |
| Partículas          | color del objeto que explota |
| Power-up 3x         | verde (`--green`)            |
| Fondo               | `#000`                       |

Teclas: `ArrowLeft`/`ArrowRight` rotar, `ArrowUp` propulsar, `Space` disparar/empezar, `P`/`Escape` pausa.

HUD (`player-hud`): JUGADOR · PUNTUACIÓN · VIDAS (`♥` × vidas) · NIVEL (2 dígitos) · stat extra **3X** con segundos restantes, visible solo si `powerUp > 0`.

## Estructura de archivos

```
lib/
  engines/
    types.ts                 # NUEVO: interfaz común de motores
    asteroids.ts             # NUEVO: createAsteroids(canvas, cb) — port de game.js
    registry.ts              # NUEVO: ENGINES + getEngine
  games.ts                   # MODIFICA: texto long de `rocas`
components/
  game-canvas.tsx            # NUEVO: "use client"; <canvas> + ciclo de vida del motor
  game-player.tsx            # MODIFICA: rama motor real vs simulador; overlay inicio; stat 3X
app/globals.css              # MODIFICA: estilos del canvas, overlay de inicio, tabla de controles, stat 3X
```

`app/juegos/[id]/jugar/page.tsx` no cambia (sigue pasando `game` a `GamePlayer`; la resolución del motor ocurre en el cliente vía `getEngine(game.id)`).

## Implementation plan

1. Leer `node_modules/next/dist/docs/01-app/` (client components, `"use client"`) para confirmar que nada de Next 16.4 cambia el patrón de montar un canvas en un client component.
2. Crear `lib/engines/types.ts` y `lib/engines/registry.ts` (vacío salvo el tipo). Verificar: `npm run build` pasa.
3. Crear `lib/engines/asteroids.ts` portando `game.js`: clases `Bullet`, `Asteroid`, `PowerUp`, `Ship`, `Particle` y funciones `spawnAsteroids`, `nextLevel`, `explode`, `killShip`, `update`, `draw` dentro del closure de `createAsteroids`, recibiendo `ctx` y tamaño en vez de globals. Quitar `drawHUD`, `drawLifeIcon`, `drawOverlay` y el reinicio con Espacio en `gameover`. Añadir estados `ready` y `paused`. Emitir `onStats` solo al cambiar, `onStateChange` en cada transición, `onGameOver` al llegar a `gameover` (por vidas o por `end()`). Aplicar la paleta neón.
4. Input dentro del motor: listeners `keydown`/`keyup` en `window`; ignorar eventos cuyo target sea `input`, `textarea` o `contenteditable`; `preventDefault` en las teclas del juego (keydown y keyup) mientras el estado no sea `gameover`. `visibilitychange` → `pause()` si está `playing`/`dead`. Todo se retira en `destroy()`.
5. Escalado: `canvas.width = 800 * dpr`, `canvas.height = 600 * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`; CSS `width: 100%; height: 100%`. Registrar `rocas` en `ENGINES`.
6. Crear `components/game-canvas.tsx`: recibe `factory`, callbacks y un `ref` imperativo (`pause/resume/restart/end`); `useEffect` crea el motor y devuelve `destroy` (compatible con el doble montaje de StrictMode). Callbacks guardados en refs para no recrear el motor en cada render.
7. Modificar `components/game-player.tsx`:
   - `const factory = getEngine(game.id)`. Sin motor → rama simulada actual intacta.
   - Con motor: `GameCanvas` dentro de `.crt-screen`; HUD alimentado por `onStats`; `paused` derivado de `onStateChange`; PAUSA/REANUDAR llama `pause()/resume()`; FIN llama `end()`; `onGameOver` abre el modal; JUGAR DE NUEVO llama `restart()` y resetea `saved`.
   - Overlay de inicio en estado `ready`: "PULSA ESPACIO PARA EMPEZAR", tabla de controles, y "REQUIERE TECLADO" si no hay puntero fino.
   - Stat 3X en el HUD cuando `powerUp > 0`.
   - Los botones del HUD hacen `blur()` tras click para que Espacio no los reactive.
8. Estilos en `app/globals.css` (canvas a tamaño completo del `.crt-screen`, overlay de inicio, tabla de controles, stat 3X en verde), reutilizando clases existentes (`crt-content`, `pixel`, `mono`, `neon-*`). Seguir `/frontend-design` según `CLAUDE.md`.
9. Ajustar el texto `long` de `rocas` en `lib/games.ts`.
10. Verificación manual completa (criterios de aceptación) en `npm run dev`, luego `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] `npm run build` termina sin errores.
- [ ] `npm run lint` termina sin errores.
- [ ] `/juegos/rocas/jugar` muestra el canvas dentro del marco CRT con asteroides magenta moviéndose y el overlay "PULSA ESPACIO PARA EMPEZAR" con la tabla de controles.
- [ ] Espacio arranca la partida; la nave cyan aparece al centro parpadeando ~3 s.
- [ ] ←/→ rotan, ↑ propulsa con llama visible y la nave conserva inercia; los objetos cruzan los bordes y reaparecen por el lado opuesto.
- [ ] Espacio dispara (máx. una bala cada 0.2 s); la página no hace scroll con flechas ni Espacio.
- [ ] Destruir un asteroide grande suma 20, mediano 50, pequeño 100 en PUNTUACIÓN del HUD React; grande → 2 medianos → 2 pequeños → desaparece, con partículas.
- [ ] Al vaciar el nivel, NIVEL pasa a 02 y aparecen 5 asteroides grandes lejos de la nave.
- [ ] Recoger el power-up verde muestra la stat 3X con cuenta regresiva y dispara 3 balas en abanico durante 5 s.
- [ ] Chocar resta un ♥ en VIDAS; la nave reaparece tras ~2 s con invencibilidad.
- [ ] Al perder la tercera vida se abre el modal FIN DEL JUEGO con la puntuación real.
- [ ] En el modal se puede escribir el nombre (incluido Espacio) y GUARDAR PUNTUACIÓN escribe una entrada `{ game: "rocas", score, name, at }` en `av_scores`.
- [ ] JUGAR DE NUEVO reinicia a puntuación 0, 3 vidas, nivel 01, jugando inmediatamente.
- [ ] PAUSA, `P` y `Escape` congelan el juego y muestran "EN PAUSA"; REANUDAR / `P` / `Escape` lo continúan.
- [ ] Cambiar de pestaña y volver deja el juego en pausa.
- [ ] FIN durante la partida abre el modal con la puntuación actual y el juego deja de avanzar.
- [ ] Tras pulsar PAUSA con el ratón, Espacio dispara (no vuelve a pulsar el botón).
- [ ] SALIR o VOLVER AL VAULT y volver a entrar no duplica la velocidad del juego ni deja listeners/rAF activos (sin disparos dobles por tecla).
- [ ] Otros juegos (p.ej. `/juegos/caida/jugar`) siguen mostrando la partida simulada sin cambios.
- [ ] En un viewport táctil emulado (DevTools) el overlay de inicio muestra "REQUIERE TECLADO".
- [ ] El canvas se ve nítido (sin blur) en pantallas con `devicePixelRatio` 2.
- [ ] Sin errores de hidratación ni errores en consola en `/juegos/rocas/jugar`.
- [ ] El texto de la ficha `/juegos/rocas` ya no menciona OVNIs.
- [ ] `references/started-games/02-asteroids/` no tiene cambios introducidos por este spec.

## Decisions

- **Yes:** reusar la entrada mock `rocas` (misma URL, cover y textos). Ya existe en el catálogo con la temática exacta.
- **No:** nueva entrada `asteroides` ni renombrar. Duplicaría el juego o rompería URLs/puntajes locales.
- **Yes:** port a TypeScript en un motor con factory y closure. Tipado estricto, sin globals, destruible al desmontar.
- **No:** iframe con el `game.js` en `public/`. Aislado del diseño, HUD y sesión; comunicación por `postMessage` frágil.
- **Yes:** HUD y fin de partida en React (`player-hud` + modal existentes). Una sola UI coherente para todos los juegos.
- **No:** HUD/GAME OVER dibujados en canvas.
- **Yes:** recolor neón con la paleta de la plataforma. Encaja con la estética del vault.
- **No:** blanco original.
- **Yes:** registro `id → motor` con fallback al simulador. Prepara Tetris/Arkanoid sin romper los demás juegos.
- **No:** mostrar "PRÓXIMAMENTE" en los juegos sin motor.
- **Yes:** overlay "PULSA ESPACIO PARA EMPEZAR", pausa con botón/`P`/`Escape` y auto-pausa por visibilidad. El jugador no pierde vidas al entrar ni al cambiar de pestaña.
- **No:** arranque inmediato como el original.
- **Yes:** solo teclado, aviso "REQUIERE TECLADO" en táctiles. Touch es su propio spec.
- **Yes:** `saveScore` / `av_scores` sin cambios. Puntajes en BD tienen su propio spec.
- **Yes:** mantener el power-up 3x del original.
- **No:** sonido. Amplía scope; el original no lo tiene.
- **Yes:** el motor resuelve en el cliente (`getEngine` en `game-player.tsx`); `page.tsx` no cambia. Las factories no son serializables a través de la frontera server/client.
- **Yes:** `onStats` solo al cambiar valores. Evita re-renders de React a 60 fps.

## Risks

| Risk                                                                         | Mitigation                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| StrictMode monta/desmonta dos veces → dos rAF / listeners duplicados         | `destroy()` idempotente que cancela rAF y quita todos los listeners; criterio de aceptación explícito. |
| Espacio reactiva el último botón con foco (PAUSA, JUGAR DE NUEVO)            | `preventDefault` en keydown y keyup de teclas del juego + `blur()` tras click en botones del HUD.      |
| `preventDefault` global rompe escribir el nombre en el modal                 | El motor ignora eventos con target `input`/`textarea`/`contenteditable`.                               |
| Callbacks que cambian en cada render recrean el motor y reinician la partida | Callbacks en refs dentro de `game-canvas.tsx`; el `useEffect` depende solo de la factory.              |
| Acceso a `window`/`document` durante SSR                                     | El motor solo se instancia dentro de `useEffect`; ningún código de motor corre en módulo top-level.    |
| `shadowBlur` en cada trazo baja el rendimiento en equipos modestos           | Glow solo en nave, asteroides y power-up; partículas y balas sin `shadowBlur` si se nota caída de fps. |
| Desfase entre la paleta del canvas y los tokens CSS                          | Constantes con los mismos valores hex que `app/globals.css`, documentadas junto a los tokens.          |

## What is **not** in this spec

- Controles táctiles / móvil jugable.
- Sonido.
- OVNIs u otras mecánicas nuevas.
- Puntajes en BD, Salón real, récords reales en la ficha.
- Tetris y Arkanoid.
- Anti-trampas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
