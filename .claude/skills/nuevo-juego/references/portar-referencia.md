# Portar un juego de `references/started-games/`

Las carpetas de referencia son juegos HTML/JS vanilla (un `index.html`, un `game.js` con globals, a veces `style.css`, `levels.js`, `assets/`). Son **solo lectura**: el port vive en `lib/engines/`.

## Qué leer

1. `README.md` y `CLAUDE.md` de la carpeta: controles, mecánicas, estructura. El `CLAUDE.md` suele tener una tabla de identificadores clave muy útil para el spec.
2. `game.js` completo: es la fuente de verdad de las mecánicas. Si difiere del README, manda el código.
3. `index.html` / `style.css`: solo para saber qué UI tiene el original (HUD, overlays, preview) y decidir qué pasa a React.
4. Auxiliares (`levels.js`, `spritesheet.js`, `assets/`): datos que el port debe conservar (patrones de niveles) o assets a decidir.

## Qué extraer para el spec

Anota con valores concretos (el spec los cita, no dice "igual que el original" a secas):

| Aspecto | Ejemplos de lo que buscar |
| --- | --- |
| Constantes | tamaños, velocidades, tiempos, tabla de puntos (`LINE_SCORES`, `POINTS`), vidas iniciales |
| Estados | flags `paused`, `gameOver`, `won`; transiciones; reinicio con tecla |
| Puntuación | qué suma y cuánto, multiplicadores por nivel, bonus |
| Progresión | cómo sube el nivel, cuántos niveles, qué pasa al terminar el último |
| Fin | vidas a 0, tablero lleno, victoria |
| Controles | teclas y ratón; teclas de debug/trucos (normalmente se descartan) |
| UI del original | HUD, overlays de pausa / game over / victoria, preview, selector de nivel |
| Dibujo | primitivas usadas (vectorial vs sprites), colores originales |
| Sonido | archivos y momentos en que suenan |
| Dimensiones | tamaño del canvas y proporción |

## Qué se transforma siempre (convención SPEC 05)

- Globals y `getElementById` → estado dentro del closure de la factory.
- HUD dibujado o en DOM → `onStats` hacia el `player-hud` React.
- Overlays de pausa / game over / victoria del original → overlay "EN PAUSA" y modal FIN DEL JUEGO de la plataforma.
- Reinicio con tecla en game over → se elimina; lo hace JUGAR DE NUEVO (`restart()`).
- Arranque inmediato → estado `ready` + overlay de inicio.
- Colores originales → paleta neón (tabla elemento → color en el spec).
- Canvas de tamaño propio → composición dentro de 800×600 lógico.

## Qué se pregunta (no se decide solo)

- Sonido (SPEC 05 lo dejó fuera; por defecto fuera).
- Sprites vs redibujo vectorial (por defecto redibujo).
- Selector de nivel, trucos, modos extra del original (por defecto fuera).
- Ratón además de teclado, si el original lo soporta.
- Si la victoria (completar todos los niveles) termina la partida o reinicia en bucle con dificultad mayor.

## Particularidades conocidas

- **03-tetris**: tablero `300×600` + preview `120×120`, sin vidas, stats score / líneas / nivel, velocidad por nivel, hard drop y soft drop suman puntos, ghost piece. Encaja con el mock `caida` (PUZZLE, magenta). Necesita el hueco de HUD sin vidas y controles propios (ver contrato §5). Ojo: el `long` de `caida` dice "cada 10 líneas", coherente con `level = floor(lines/10) + 1`.
- **04-arkanoid**: canvas 800×600, ratón o ←/→, P/Escape pausa, 3 vidas, 10 pts por bloque, 5 niveles en `levels.js`, velocidad +10 % por nivel, spritesheet + sonidos, selector de nivel en la pausa, pantalla de victoria. Encaja con el mock `bloque-buster` (ARCADE, cyan). Decisiones: ratón, sprites vs vectorial, sonido, selector de nivel, qué hacer tras el nivel 5.
- **02-asteroids**: ya portado como `rocas` (SPEC 05). Úsalo como ejemplo de cómo quedó un port.
