# Plantilla — spec de juego jugable

Esqueleto para `specs/NN-<id>-jugable.md`. Los `<…>` se sustituyen por valores concretos; los bloques marcados **[si aplica]** se borran si no aplican. No dejes ningún `<…>` en el spec final.

---

~~~~markdown
# SPEC NN — <TÍTULO> jugable: <port de X | juego original> en la plataforma

> **Status:** Borrador
> **Depends on:** SPEC 05, SPEC 06<, SPEC NN si reutiliza una generalización>
> **Date:** <fecha del contexto de sesión>
> **Objective:** <Una frase: qué juego pasa a ser jugable, desde qué origen, con leaderboard real.>

## Por qué existe este spec

<2–4 frases. Qué juego mock/nuevo se vuelve real, de dónde sale y qué convención nueva fija (p.ej. "primer juego sin vidas: generaliza el HUD").>

## Scope

**In:**

- Port de `references/started-games/<carpeta>/game.js` a TypeScript estricto en `lib/engines/<motor>.ts` <| motor original en …>, sin globals, siguiendo la estructura de `lib/engines/asteroids.ts`.
- Mecánicas: <lista concreta con valores: puntos, velocidades, niveles, vidas, fin>.
- Recolor neón (tabla en Data model). Lienzo lógico 800×600 <y cómo se compone si el original tiene otra proporción>.
- HUD en `player-hud` React: <stats>. Fin de partida con el modal FIN DEL JUEGO existente.
- Overlay de inicio: "<texto de inicio>" + tabla de controles del juego.
- Pausa con botón, `P`, `Escape` y auto-pausa por visibilidad.
- Registro `<id>` en `lib/engines/registry.ts`.
- Migración `supabase/migrations/<ts>_<id>_playable.sql`: <`playable = true` (+ `long` ajustado) | insert de la fila nueva>.
- [si aplica] Generalización de `EngineStats` / registro / overlay de inicio para soportar <motivo>; ROCAS migra sin cambios visibles.
- [si aplica] Cover `.cover-<x>` en `app/globals.css`.
- [si aplica] Ratón: <qué controla>.

**Out of scope (for future specs):**

- Controles táctiles / móvil jugable.
- Sonido.
- <Mecánicas del original descartadas: selector de nivel, trucos, …>.
- Anti-trampas / validación server-side de partidas.
- Cambios en leaderboard, Salón o `submitScore` (ya genéricos desde SPEC 06).
- Modificar `references/started-games/<carpeta>/`.
- Tests automatizados (no hay test runner configurado).

## Data model

<Si hay generalización: bloque TS de `EngineStats` / `EngineEntry` nuevo.>

```ts
// lib/engines/registry.ts — entrada del juego
<id>: { factory: create<X>, startLabel: "…", controls: [ … ], initialStats: { … } }
```

Constantes del motor (en `lib/engines/<motor>.ts`):

| Constante | Valor | Origen |
| --- | --- | --- |
| <…> | <…> | `game.js` línea / decisión |

Paleta neón:

| Elemento | Color |
| --- | --- |
| <…> | <cyan / magenta / yellow / green> (`--<token>`) |
| Fondo | `#000` |

Teclas: <…>. Puntuación: <tabla acción → puntos>. Fin de partida: <condiciones>.

Catálogo:

```sql
<update … where id = '<id>'  |  insert into public.games … >
```

## Estructura de archivos

```
lib/engines/<motor>.ts          # NUEVO
lib/engines/registry.ts         # MODIFICA
supabase/migrations/<ts>_<id>_playable.sql  # NUEVO
<lib/engines/types.ts, components/game-player.tsx, app/globals.css si aplica>
```

## Implementation plan

1. Leer `node_modules/next/dist/docs/01-app/` si el spec toca algo de framework (client components, caché). Releer `lib/engines/asteroids.ts` como referencia de estructura.
2. [si aplica] Generalizar `lib/engines/types.ts` + `registry.ts` + `components/game-player.tsx`; migrar ROCAS. Verificar: `/juegos/rocas/jugar` idéntico, `npm run build` pasa.
3. Crear `lib/engines/<motor>.ts` con estado, `initGame`, `update`, `draw` y loop; estado `ready` con <fondo>. Registrar `<id>`. Verificar: `/juegos/<id>/jugar` muestra el canvas y el overlay de inicio (aún con `playable = false` → modal en modo demo).
4. Mecánicas completas: <subpasos concretos, cada uno verificable>.
5. Input, pausa, visibilidad, `destroy()` idempotente, `onStats` solo al cambiar.
6. `npx supabase migration new <id>_playable` + SQL del Data model; `npm run db:push`. Verificar con MCP `execute_sql` y `get_advisors`. Reiniciar `npm run dev` (caché `"use cache"` del catálogo).
7. [si aplica] Cover / estilos en `app/globals.css` siguiendo `/frontend-design`.
8. Prueba e2e con sesión: jugar → GUARDAR → `/juegos/<id>` y `/salon`. Luego `npm run lint` y `npm run build`.

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `npm run db:push` no reporta cambios pendientes; `public.games` fila `<id>` con `playable = true`.
- [ ] `get_advisors` (security) sin avisos nuevos.
- [ ] `/juegos/<id>/jugar` muestra el canvas en el marco CRT y el overlay "<texto de inicio>" con la tabla de controles de este juego.
- [ ] <Tecla de inicio> arranca la partida.
- [ ] <Criterio por cada mecánica: acción → efecto exacto, p.ej. "Limpiar 1 línea en nivel 1 suma 100".>
- [ ] <Criterio de subida de nivel.>
- [ ] <Criterio de fin de partida> abre el modal FIN DEL JUEGO con la puntuación real.
- [ ] El HUD muestra <stats> y se actualiza durante la partida.
- [ ] JUGAR DE NUEVO reinicia a stats iniciales jugando inmediatamente.
- [ ] PAUSA, `P` y `Escape` congelan y reanudan; cambiar de pestaña deja el juego en pausa.
- [ ] FIN durante la partida abre el modal con la puntuación actual.
- [ ] Las teclas del juego no hacen scroll ni reactivan botones con foco.
- [ ] Salir y volver a entrar no duplica velocidad, rAF ni listeners.
- [ ] Con sesión, GUARDAR deja una fila en `scores` con `game_id = '<id>'` y el puntaje aparece en `/juegos/<id>` (leaderboard, PARTIDAS, MEJOR GLOBAL) y en `/salon` pestaña <TÍTULO> sin reiniciar el servidor.
- [ ] Invitado ve "INICIA SESIÓN PARA COMPETIR" y no puede guardar.
- [ ] `/juegos/rocas/jugar` sigue funcionando igual que antes.
- [ ] Un juego no jugable sigue mostrando el simulador y "PARTIDA DEMO · NO PUNTÚA".
- [ ] En viewport táctil emulado el overlay muestra "REQUIERE TECLADO".
- [ ] El canvas se ve nítido con `devicePixelRatio` 2.
- [ ] Sin errores de hidratación ni de consola en `/juegos/<id>/jugar`.
- [ ] `references/started-games/<carpeta>/` sin cambios.

## Decisions

- **Yes:** <reusar mock `<id>` | entrada nueva>. <razón>
- **No:** <alternativa>. <razón>
- **Yes:** mecánicas <idénticas / con cambios X>. <razón>
- **Yes:** redibujo vectorial neón. Encaja con la plataforma y evita cargar assets.
- **No:** <sprites / sonido / selector de nivel>. <razón>
- [si aplica] **Yes:** generalizar `EngineStats` con `extras` opcionales. <razón>
- **Yes:** leaderboard sin cambios: hereda SPEC 06 al marcar `playable = true`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Caché del catálogo no ve la migración en dev | Reiniciar `npm run dev`; documentado en el plan. |
| [si aplica] Generalización del HUD rompe ROCAS | Paso propio con criterio de regresión antes del motor nuevo. |
| Puntaje supera `SCORE_MAX` | `Math.min(score, SCORE_MAX)` en el motor. |
| <riesgo propio del juego> | <mitigación> |

## What is **not** in this spec

- Táctil / móvil.
- Sonido.
- <Mecánicas descartadas>.
- Anti-trampas.
- Tests automatizados.

Each one of those, if it lands, goes in its own spec.
~~~~
