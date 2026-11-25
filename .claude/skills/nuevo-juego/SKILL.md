---
name: nuevo-juego
description: Diseña el spec (specs/NN-<juego>-jugable.md) para integrar un juego jugable en Arcade Vault con motor en canvas, entrada en el catálogo public.games y leaderboard real, siguiendo las convenciones de SPEC 05 (motores) y SPEC 06 (catálogo + puntajes). Úsalo siempre que el usuario quiera añadir, portar o crear un juego nuevo para la plataforma — sea desde references/started-games/ (Tetris, Arkanoid…), convirtiendo un juego mock del catálogo (CAÍDA, BLOQUE BUSTER, SERPENTINA…) en jugable, o desde un diseño original — aunque no diga "spec" ni "leaderboard". No escribe código; la implementación se hace luego con /spec-impl.
argument-hint: 'carpeta de referencias, id del catálogo o descripción del juego'
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(grep:*), Bash(wc:*), Bash(head:*)
---

# /nuevo-juego — Spec para integrar un juego jugable

Produce **un spec** listo para `/spec-impl` que convierte un juego en jugable dentro de Arcade Vault: motor TypeScript en canvas + fila `playable = true` en `public.games` + leaderboard real. El leaderboard, la ficha, el Salón y `submitScore` ya existen (SPEC 06) y funcionan para cualquier juego `playable`; el trabajo del spec es el **motor**, la **fila del catálogo** y las **generalizaciones de la UI del reproductor** que el juego necesite.

Este skill **no escribe código**. Su salida es un único archivo `specs/NN-<slug>.md` en estado `Borrador`.

## Contexto de sesión

Fecha de hoy (úsala en el header, nunca la inventes):
!`date +%F`

Specs existentes:
!`ls specs/`

Juegos de referencia disponibles:
!`ls references/started-games/ 2>/dev/null || echo "(sin carpeta de referencias)"`

Motores registrados hoy:
!`cat lib/engines/registry.ts`

Contrato actual de motor (detecta si ya se generalizó):
!`cat lib/engines/types.ts`

Catálogo sembrado (ids, playable, sort_order):
!`grep -n "^  ('" supabase/migrations/*_games_scores.sql`

Migraciones que tocan el catálogo después del seed:
!`grep -ln "public.games" supabase/migrations/*.sql`

Skill /spec del repo (método base para escribir specs):
!`ls .claude/skills/spec/ 2>/dev/null || echo "NO ENCONTRADO: .claude/skills/spec/ — avisa al usuario (npx skills@latest add Klerith/fernando-skills)"`

Config del flujo de specs:
!`cat specs/.spec-config.yml 2>/dev/null || echo "(no existe specs/.spec-config.yml)"`

## Relación con /spec

Este skill es una **especialización de `/spec`** para juegos. `/spec` define el método (fases, cómo preguntar, plantilla, reglas del documento, cómo guardar); este skill añade lo propio de Arcade Vault (motor, catálogo, leaderboard).

- Antes de escribir cualquier spec, **lee `.claude/skills/spec/SKILL.md` y `.claude/skills/spec/template.md`** con Read. No los resumas de memoria: el usuario puede haberlos actualizado y la versión del disco es la que vale.
- Aplica sus reglas globales del documento, su forma de preguntar, sus criterios para dejar de preguntar, su Fase 3 (spec completo de una vez si hay información; sección por sección si falta) y su Fase 4 (numeración, dependencias, `specs/.spec-config.yml`, confirmación final).
- **Precedencia**: en método y formato manda `/spec`. En contenido técnico del juego (qué archivos, reglas del motor, migración, criterios estándar) manda este skill y sus referencias. Si chocan de verdad, sigue `/spec` y anota la discrepancia al usuario.
- Si `.claude/skills/spec/` no existe, díselo al usuario y continúa solo con este skill y `assets/plantilla-spec.md`.

## Material de referencia del skill

- `.claude/skills/spec/SKILL.md` y `.claude/skills/spec/template.md` — **léelos siempre, en la Fase 1**, ver "Relación con /spec".
- `references/contrato-integracion.md` — **léelo siempre.** Qué archivos toca un juego nuevo, reglas del motor, cómo entra al catálogo y al leaderboard, y los huecos de generalización conocidos (HUD y controles hardcodeados para ROCAS). Es la fuente para Scope, Data model y Plan.
- `references/portar-referencia.md` — léelo cuando el juego venga de `references/started-games/<carpeta>/`: qué extraer del `game.js` original y qué descartar.
- `assets/plantilla-spec.md` — esqueleto del spec con las secciones, pasos de plan y criterios de aceptación estándar ya redactados. Parte de aquí y adapta; no lo copies con placeholders sin rellenar.

## Fases

Sigue las fases en orden. Responde en el idioma del usuario (el repo trabaja en español).

### Fase 1 — Contexto

0. Lee `.claude/skills/spec/SKILL.md` y `.claude/skills/spec/template.md`. Todo lo que sigue se hace dentro de ese método.
1. Lee `CLAUDE.md`, `specs/05-asteroids-jugable.md` y `specs/06-leaderboard-y-catalogo-juegos.md` (son los specs de los que hereda este). Si hay specs posteriores de juegos, léelos también: pueden haber generalizado ya el HUD o el registro y cambian lo que este spec debe incluir.
2. Lee `references/contrato-integracion.md`.
3. Determina el **origen** del juego a partir de `$ARGUMENTS`:
   - **Referencia**: coincide con una carpeta de `references/started-games/` (por número `03`, nombre `tetris` o ruta). Lee `references/portar-referencia.md` y luego el `README.md`, `CLAUDE.md` (si existe), `game.js` y archivos auxiliares (`levels.js`, `assets/`) de esa carpeta. Anota mecánicas, constantes, estados, puntuación, controles, HUD y assets.
   - **Mock del catálogo**: coincide con un `id` o título del seed (p.ej. `serpentina`, `CAÍDA`). El juego se diseña para encajar con el texto `long` existente.
   - **Original**: ninguna de las anteriores. Hará falta definir mecánicas completas en la Fase 2.
   - Si `$ARGUMENTS` está vacío, lista las carpetas de referencias y los juegos mock no jugables y pregunta cuál.
4. Cruza referencia ↔ catálogo: si una referencia encaja con un mock existente (tetris ↔ `caida`, arkanoid ↔ `bloque-buster`, etc.), propónlo como opción recomendada — reusar el mock mantiene URL, cover y orden, y solo cambia `playable` y quizá `long`.
5. Comprueba el estado de las generalizaciones (ver "Huecos conocidos" en el contrato) leyendo `components/game-player.tsx` y `lib/engines/types.ts`. Decide si este spec debe incluir la generalización o si ya está hecha.

### Fase 2 — Preguntas

Pregunta en bloques de 3–5 con `AskUserQuestion`, recomendación primero y marcada. No preguntes lo que ya se deduce del código o de la referencia: propón el valor y deja que el usuario lo corrija. Cubre:

- **Catálogo**: reusar mock `<id>` vs entrada nueva. Si es nueva: `id` (regex `^[a-z0-9-]{2,32}$`), `title`, `short`, `long`, `cat`, `color`, cover (clase CSS nueva vs reutilizar). Nombres originales, nunca la marca del juego clásico (ver contrato, "Nombres y estética").
- **Mecánicas**: idénticas al original vs cambios. Qué se descarta (sonido, selector de nivel, trucos, pantallas del original).
- **Puntuación**: cómo se calcula; debe ser entero, mayor = mejor, y la partida típica debe poder dar ≥ 1. Si el juego es por tiempo o "menos es mejor", plantea la conversión o déjalo fuera (el leaderboard ordena `score desc`).
- **Fin de partida**: qué dispara `gameover` (vidas, tope, victoria al terminar todos los niveles). La victoria también llama `onGameOver(score)`.
- **HUD**: qué stats muestra (vidas, nivel, líneas, power-ups…) y, si el HUD aún está hardcodeado para ROCAS, qué forma toma la generalización (propón la del contrato).
- **Controles**: teclas; ratón si el original lo usa. Táctil queda fuera salvo que el usuario lo pida explícitamente (sería su propio spec).
- **Assets**: redibujar vectorial neón (recomendado) vs copiar sprites/sonidos a `public/games/<id>/`.

Para cuando puedas responder sin suponer: ¿qué archivos cambian?, ¿cuál es el primer y el último paso ejecutable?, ¿cómo se verifica que está terminado (incluido que el puntaje aparece en `/juegos/<id>` y `/salon`)?

Si el usuario pide además cosas grandes (multijugador, táctil, sonido nuevo, anti-trampas), señala que van en su propio spec y anótalas en "Out of scope".

### Fase 3 — Escribir el spec

Antes de crear el archivo, vuelve a abrir la Fase 3, las "Hard rules" de `.claude/skills/spec/SKILL.md` y `.claude/skills/spec/template.md` y comprueba que el spec cumple sus reglas: objetivo en una frase, Scope con In y Out, plan en pasos ejecutables (sin "probar todo" como último paso), criterios booleanos sin antipatrones, Decisions con lo descartado y sección final "What is not".

Con la información completa, escribe el spec entero de una vez. La estructura sale de `template.md` de `/spec`; el contenido de juego, de `assets/plantilla-spec.md`:

- Mismo idioma, mismas etiquetas de estado (`Borrador` / `Aprobado` / `Implementado`) y mismos encabezados que SPEC 05/06.
- `Depends on`: SPEC 05 y SPEC 06 como mínimo (más los specs de juego que hayan generalizado algo que este reutiliza). Verifica que existen.
- Objetivo en una sola frase.
- Rutas, ids, constantes y textos concretos: nada de "el módulo del juego" ni TODOs.
- Los pasos del plan dejan el sistema ejecutable cada uno; la generalización del reproductor (si aplica) va **antes** del motor nuevo y debe dejar ROCAS funcionando igual.
- Incluye los criterios de aceptación estándar de la plantilla más los específicos de las mecánicas del juego (puntos exactos por acción, condición de nivel, condición de fin).
- Sección de Decisions con lo que se eligió **y lo que se descartó** en la Fase 2.

Si faltó información porque el usuario cortó la Fase 2, desarrolla sección por sección pidiendo confirmación, y registra en Decisions "Definición rápida sin clarificación detallada".

### Fase 4 — Guardar

Sigue la Fase 4 de `/spec` (incluye comprobar dependencias y crear `specs/.spec-config.yml` si falta, sin tocarlo si existe). Con estas concreciones:

1. Número: el mayor de `specs/` + 1, dos dígitos. Slug kebab-case, normalmente `<id>-jugable` (p.ej. `07-caida-jugable.md`).
2. Escribe `specs/NN-slug.md` directamente; solo pregunta si ya existe.
3. Estado `Borrador`. Nunca `Aprobado`.
4. Confirma: ruta del archivo, que está en `Borrador`, y que el siguiente paso es revisarlo, cambiarlo a `Aprobado` y ejecutar `/spec-impl NN-slug`. **Detente ahí.**

## Reglas

- Solo escribes el `.md` del spec. Ni motor, ni migración, ni CSS.
- No modifiques nada en `references/started-games/` (solo lectura).
- No inventes decisiones que el usuario no confirmó; si algo se deduce de la referencia, preséntalo como propuesta y deja que lo corrija.
- Un juego por spec. Si piden dos, propón dos specs; el segundo puede reutilizar la generalización del primero.
