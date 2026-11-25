// SERPENTINA: motor original de serpiente sobre rejilla (SPEC 09), sin globals.
// Todo el estado vive dentro del closure de createSnake().

import type {
  EngineCallbacks,
  EngineFactory,
  EngineState,
  EngineStats,
  GameEngine,
} from "./types";
import { statsEqual } from "./stats";
import { SCORE_MAX } from "@/lib/games";

// ── Paleta (mismos valores que los tokens de app/globals.css) ────────────────
const COLOR_HEAD = "#00f5ff"; // --cyan
const COLOR_HEAD_DEAD = "#ff006e"; // --magenta
const COLOR_BODY = "#00ff88"; // --green
const COLOR_EYE = "#000";
const COLOR_MAGENTA = "#ff006e"; // --magenta
const COLOR_YELLOW = "#f5ff00"; // --yellow
const COLOR_GREEN = "#00ff88"; // --green
const COLOR_CYAN = "#00f5ff"; // --cyan
const COLOR_BRONZE = "#d97a3a"; // --bronze
const COLOR_FRAME = "#ff006e"; // --magenta
const COLOR_GRID = "rgba(230, 233, 255, 0.04)";
const COLOR_BG = "#000";
const GLOW = 12;

// ── Constantes ────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
const MAX_DT = 0.05; // s

const COLS = 32;
const ROWS = 24;
const CELL = 25; // px
const SEG_MARGIN = 2; // px dentro de la celda → segmento de 21 × 21
const EYE = 3; // px

type Dir = "up" | "down" | "left" | "right";
type FruitKind = "cherry" | "lemon" | "apple" | "grape" | "melon";
interface Cell {
  x: number;
  y: number;
} // columna 0–31, fila 0–23; origen arriba-izquierda

const FRUIT_KINDS: FruitKind[] = ["cherry", "lemon", "apple", "grape", "melon"];

/** Posición de los dos ojos dentro del segmento de 21 × 21, hacia el lado de `dir`. */
const EYES: Record<Dir, [number, number][]> = {
  right: [
    [15, 5],
    [15, 13],
  ],
  left: [
    [3, 5],
    [3, 13],
  ],
  up: [
    [5, 3],
    [13, 3],
  ],
  down: [
    [5, 15],
    [13, 15],
  ],
};

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const MAX_TURN_QUEUE = 2;

const POINTS_PER_FRUIT = 10; // × nivel
const FRUITS_PER_LEVEL = 5;

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
const GAME_KEYS = new Set([...Object.keys(KEY_DIR), "Space", "KeyP", "Escape"]);

/** Intervalo de tick en ms: max(60, 150 − (nivel − 1) × 10). */
function tickInterval(level: number): number {
  return Math.max(60, 150 - (level - 1) * 10);
}

function initialSnake(): Cell[] {
  return [
    { x: 16, y: 12 },
    { x: 15, y: 12 },
    { x: 14, y: 12 },
  ];
}

export const createSnake: EngineFactory = (
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
): GameEngine => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D no disponible");
  const ctx: CanvasRenderingContext2D = context;

  // ── Escalado: lienzo lógico W×H, buffer nítido según devicePixelRatio ──────
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Estado del juego ────────────────────────────────────────────────────────
  let snake: Cell[] = initialSnake(); // snake[0] = cabeza
  let dir: Dir = "right"; // dirección del último tick
  let turnQueue: Dir[] = []; // máx. 2 giros pendientes
  let fruit: { cell: Cell; kind: FruitKind } | null = null;
  let fruits = 0; // frutas comidas en la partida
  let score = 0;
  let level = 1;
  let tickAccum = 0; // ms acumulados hacia el siguiente tick
  let crashed = false; // fin por choque → cabeza magenta
  let state: EngineState = "ready";

  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  let lastStats: EngineStats | null = null;

  function setState(next: EngineState) {
    if (state === next) return;
    state = next;
    cb.onStateChange(next);
  }

  function emitStats() {
    const stats: EngineStats = {
      score,
      level,
      extras: [{ key: "length", label: "Longitud", value: String(snake.length) }],
    };
    if (statsEqual(lastStats, stats)) return;
    lastStats = stats;
    cb.onStats(stats);
  }

  /** Único punto de fin: garantiza un solo onGameOver(score) por partida. */
  function goGameOver() {
    if (state === "gameover") return;
    setState("gameover");
    emitStats();
    cb.onGameOver(score);
  }

  // ── Fruta ───────────────────────────────────────────────────────────────────
  /** Celda uniforme entre las libres; tipo uniforme entre los 5. null si no queda ninguna. */
  function spawnFruit(): boolean {
    const occupied = new Set(snake.map((c) => c.y * COLS + c.x));
    const free: Cell[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(y * COLS + x)) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      fruit = null;
      return false;
    }
    const cell = free[Math.floor(Math.random() * free.length)];
    const kind = FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
    fruit = { cell, kind };
    return true;
  }

  function initGame() {
    snake = initialSnake();
    dir = "right";
    turnQueue = [];
    fruits = 0;
    score = 0;
    level = 1;
    tickAccum = 0;
    crashed = false;
    spawnFruit();
  }

  function startGame() {
    initGame();
    setState("playing");
  }

  // ── Giros ───────────────────────────────────────────────────────────────────
  /** Compara con el último giro encolado (o con `dir`): ignora igual, opuesta y cola llena. */
  function queueTurn(next: Dir) {
    if (state !== "playing") return;
    if (turnQueue.length >= MAX_TURN_QUEUE) return;
    const last = turnQueue.length > 0 ? turnQueue[turnQueue.length - 1] : dir;
    if (next === last || next === OPPOSITE[last]) return;
    turnQueue.push(next);
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function step() {
    const queued = turnQueue.shift();
    if (queued) dir = queued;
    const d = DELTA[dir];
    const head = { x: snake[0].x + d.x, y: snake[0].y + d.y };

    // Choque con el borde: se conserva el último frame.
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      crash();
      return;
    }

    const grow = fruit !== null && head.x === fruit.cell.x && head.y === fruit.cell.y;

    // Choque con el cuerpo. Si no crece, la cola actual se retira en este paso y no cuenta.
    const bodyEnd = grow ? snake.length : snake.length - 1;
    for (let i = 0; i < bodyEnd; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        crash();
        return;
      }
    }

    snake.unshift(head);
    // Crecimiento: el tick que come no retira la cola.
    if (!grow) snake.pop();
    if (grow) eatFruit();
  }

  function crash() {
    crashed = true;
    goGameOver();
  }

  /** Suma con el nivel previo a la fruta, sube nivel cada 5 frutas y sortea la siguiente. */
  function eatFruit() {
    score = Math.min(score + POINTS_PER_FRUIT * level, SCORE_MAX);
    fruits++;
    level = Math.floor(fruits / FRUITS_PER_LEVEL) + 1;
    // Victoria: no queda celda libre para la fruta nueva.
    if (!spawnFruit()) goGameOver();
  }

  function update(dt: number) {
    if (state !== "playing") return;
    tickAccum += dt * 1000;
    let interval = tickInterval(level);
    while (tickAccum >= interval) {
      tickAccum -= interval;
      step();
      if (state !== "playing") return;
      interval = tickInterval(level);
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  function drawGrid() {
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, H);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(W, r * CELL + 0.5);
    }
    ctx.stroke();
  }

  function drawFrame() {
    ctx.save();
    ctx.strokeStyle = COLOR_FRAME;
    ctx.shadowColor = COLOR_FRAME;
    ctx.shadowBlur = GLOW;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
  }

  function drawSegment(c: Cell) {
    ctx.fillRect(c.x * CELL + SEG_MARGIN, c.y * CELL + SEG_MARGIN, CELL - SEG_MARGIN * 2, CELL - SEG_MARGIN * 2);
  }

  function drawSnake() {
    ctx.fillStyle = COLOR_BODY;
    for (let i = snake.length - 1; i >= 1; i--) drawSegment(snake[i]);
    const headColor = crashed ? COLOR_HEAD_DEAD : COLOR_HEAD;
    ctx.save();
    ctx.shadowColor = headColor;
    ctx.shadowBlur = GLOW;
    ctx.fillStyle = headColor;
    drawSegment(snake[0]);
    ctx.restore();
    drawEyes(snake[0]);
  }

  function drawEyes(head: Cell) {
    const sx = head.x * CELL + SEG_MARGIN;
    const sy = head.y * CELL + SEG_MARGIN;
    ctx.fillStyle = COLOR_EYE;
    for (const [ex, ey] of EYES[dir]) ctx.fillRect(sx + ex, sy + ey, EYE, EYE);
  }

  // ── Frutas vectoriales neón (centro de la celda = cx, cy) ───────────────────
  function circle(x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Dos círculos de radio 5 unidos por un rabito en V. */
  function drawCherry(cx: number, cy: number) {
    ctx.strokeStyle = COLOR_GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 5.5, cy);
    ctx.lineTo(cx, cy - 9);
    ctx.lineTo(cx + 5.5, cy);
    ctx.stroke();
    ctx.fillStyle = COLOR_MAGENTA;
    circle(cx - 5.5, cy + 4, 5);
    circle(cx + 5.5, cy + 4, 5);
  }

  /** Elipse 9 × 6 (radios) con dos puntas en los extremos. */
  function drawLemon(cx: number, cy: number) {
    ctx.fillStyle = COLOR_YELLOW;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 2);
    ctx.lineTo(cx - 11.5, cy);
    ctx.lineTo(cx - 8, cy + 2);
    ctx.moveTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 11.5, cy);
    ctx.lineTo(cx + 8, cy + 2);
    ctx.fill();
  }

  /** Círculo de radio 8 con hoja en la parte superior. */
  function drawApple(cx: number, cy: number) {
    ctx.fillStyle = COLOR_GREEN;
    circle(cx, cy + 2, 8);
    ctx.fillStyle = COLOR_CYAN;
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy - 8, 4, 2, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Racimo de 6 círculos de radio 3,5 en triángulo invertido (3 · 2 · 1). */
  function drawGrape(cx: number, cy: number) {
    ctx.fillStyle = COLOR_CYAN;
    const r = 3.5;
    const dx = 7;
    const dy = 6;
    circle(cx - dx, cy - dy, r);
    circle(cx, cy - dy, r);
    circle(cx + dx, cy - dy, r);
    circle(cx - dx / 2, cy, r);
    circle(cx + dx / 2, cy, r);
    circle(cx, cy + dy, r);
  }

  /** Media luna: semicírculo de radio 9 con corteza verde de 2 px en la curva. */
  function drawMelon(cx: number, cy: number) {
    const top = cy - 4;
    ctx.fillStyle = COLOR_BRONZE;
    ctx.beginPath();
    ctx.arc(cx, top, 9, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLOR_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, top, 8, 0, Math.PI);
    ctx.stroke();
  }

  const FRUIT_GLOW: Record<FruitKind, string> = {
    cherry: COLOR_MAGENTA,
    lemon: COLOR_YELLOW,
    apple: COLOR_GREEN,
    grape: COLOR_CYAN,
    melon: COLOR_BRONZE,
  };

  const FRUIT_DRAW: Record<FruitKind, (cx: number, cy: number) => void> = {
    cherry: drawCherry,
    lemon: drawLemon,
    apple: drawApple,
    grape: drawGrape,
    melon: drawMelon,
  };

  function drawFruit() {
    if (!fruit) return;
    const cx = fruit.cell.x * CELL + CELL / 2;
    const cy = fruit.cell.y * CELL + CELL / 2;
    ctx.save();
    ctx.shadowColor = FRUIT_GLOW[fruit.kind];
    ctx.shadowBlur = GLOW;
    FRUIT_DRAW[fruit.kind](cx, cy);
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);
    drawGrid();
    drawFruit();
    drawSnake();
    drawFrame();
  }

  // ── Loop principal ──────────────────────────────────────────────────────────
  function loop(ts: number) {
    if (destroyed) return;
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, MAX_DT);
    lastTime = ts;
    update(dt);
    draw();
    emitStats();
    rafId = requestAnimationFrame(loop);
  }

  // ── API pública ─────────────────────────────────────────────────────────────
  function pause() {
    if (destroyed || state !== "playing") return;
    turnQueue = [];
    setState("paused");
  }

  function resume() {
    if (destroyed || state !== "paused") return;
    // Un giro pulsado antes o durante la pausa no se aplica al reanudar.
    turnQueue = [];
    setState("playing");
  }

  function restart() {
    if (destroyed) return;
    startGame();
    emitStats();
  }

  function end() {
    if (destroyed || state === "gameover") return;
    goGameOver();
  }

  // ── Listeners de ventana ────────────────────────────────────────────────────
  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (state !== "gameover") e.preventDefault();
    if (e.repeat) return;

    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "paused") resume();
      else pause();
      return;
    }

    if (e.code === "Space") {
      // `ready` ya tiene la partida inicial (serpiente y primera fruta): solo arranca.
      if (state === "ready") setState("playing");
      return;
    }

    const next = KEY_DIR[e.code];
    if (next) queueTurn(next);
  }

  // Evita que Espacio al soltarse active el botón con foco.
  function onKeyUp(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (state !== "gameover") e.preventDefault();
  }

  function onVisibilityChange() {
    if (document.hidden) pause();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", onVisibilityChange);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  // ── Arranque: estado `ready` con la serpiente estática y la primera fruta ───
  initGame();
  cb.onStateChange(state);
  emitStats();
  rafId = requestAnimationFrame(loop);

  return { pause, resume, restart, end, destroy };
};
