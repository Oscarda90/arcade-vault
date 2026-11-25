// Port de references/started-games/03-tetris/game.js a un motor sin globals.
// Todo el estado vive dentro del closure de createTetris().

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
// Índice = tipo de pieza (1–8); 0 = celda vacía.
const COLORS: readonly (string | null)[] = [
  null,
  "#00f5ff", // I — --cyan
  "#f5ff00", // O — --yellow
  "#ff006e", // T — --magenta
  "#00ff88", // S — --green
  "#d97a3a", // Z — --bronze
  "#e6e9ff", // J — --ink
  "#ffcf3a", // L — --gold
  "#c7d0e0", // N (tuerca) — --silver
];
const COLOR_FRAME = "#ff006e"; // --magenta
const COLOR_GRID = "rgba(230, 233, 255, 0.06)";
const COLOR_LABEL = "#8a8fb5"; // --ink-dim
const COLOR_HIGHLIGHT = "rgba(255, 255, 255, 0.12)";
const COLOR_BG = "#000";
const GLOW = 12;

// ── Constantes ────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
const MAX_DT = 50; // ms

const COLS = 10;
const ROWS = 20;
const BLOCK = 28;
const BOARD_X = 260;
const BOARD_Y = 20;
const BOARD_W = COLS * BLOCK; // 280
const BOARD_H = ROWS * BLOCK; // 560

const NEXT_X = 580;
const NEXT_Y = 60;
const NEXT_CELLS = 4;
const NEXT_SIZE = NEXT_CELLS * BLOCK; // 112
const NEXT_LABEL_Y = 44;

const START_DROP_INTERVAL = 1000; // ms
const MIN_DROP_INTERVAL = 100; // ms
const DROP_STEP = 90; // ms menos por nivel
const LINES_PER_LEVEL = 10;
const LINE_SCORES = [0, 100, 300, 500, 800];
const SOFT_DROP_POINTS = 1; // por fila
const HARD_DROP_POINTS = 2; // por celda recorrida

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyX",
  "Space",
  "KeyP",
  "Escape",
]);

type Shape = number[][];

const PIECES: readonly (Shape | null)[] = [
  null,
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  [[2, 2], [2, 2]], // O
  [[0, 3, 0], [3, 3, 3], [0, 0, 0]], // T
  [[0, 4, 4], [4, 4, 0], [0, 0, 0]], // S
  [[5, 5, 0], [0, 5, 5], [0, 0, 0]], // Z
  [[6, 0, 0], [6, 6, 6], [0, 0, 0]], // J
  [[0, 0, 7], [7, 7, 7], [0, 0, 0]], // L
  [[8, 8, 8], [8, 0, 8], [8, 8, 8]], // N (tuerca)
];
const PIECE_TYPES = PIECES.length - 1; // 8

const KICKS = [0, -1, 1, -2, 2];

interface Piece {
  type: number;
  shape: Shape;
  x: number;
  y: number;
}

function createBoard(): number[][] {
  return Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
}

function randomPiece(): Piece {
  const type = Math.floor(Math.random() * PIECE_TYPES) + 1;
  const shape = PIECES[type]!.map((row) => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function rotateCW(shape: Shape): Shape {
  const rows = shape.length;
  const cols = shape[0].length;
  const result: Shape = Array.from({ length: cols }, () => new Array<number>(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
  return result;
}

export const createTetris: EngineFactory = (
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

  // next/font genera nombres con hash: se lee la familia real de --pixel.
  const pixelFont = getComputedStyle(canvas).getPropertyValue("--pixel").trim() || "monospace";

  // ── Estado del juego ────────────────────────────────────────────────────────
  let board = createBoard();
  let current: Piece | null = null;
  let next: Piece | null = null;
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropInterval = START_DROP_INTERVAL;
  let dropAccum = 0;
  let state: EngineState = "ready";

  let rafId: number | null = null;
  let lastTime: number | null = null;
  let destroyed = false;
  let lastStats: EngineStats | null = null;

  function setState(nextState: EngineState) {
    if (state === nextState) return;
    state = nextState;
    cb.onStateChange(nextState);
  }

  function emitStats() {
    const stats: EngineStats = {
      score,
      level,
      extras: [{ key: "lines", label: "Líneas", value: String(lines) }],
    };
    if (statsEqual(lastStats, stats)) return;
    lastStats = stats;
    cb.onStats(stats);
  }

  function goGameOver() {
    setState("gameover");
    emitStats();
    cb.onGameOver(score);
  }

  // ── Reglas del tablero ──────────────────────────────────────────────────────
  function collide(shape: Shape, ox: number, oy: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = ox + c;
        const ny = oy + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function addScore(points: number) {
    score = Math.min(score + points, SCORE_MAX);
  }

  function tryRotate(p: Piece) {
    const rotated = rotateCW(p.shape);
    for (const kick of KICKS) {
      if (!collide(rotated, p.x + kick, p.y)) {
        p.shape = rotated;
        p.x += kick;
        return;
      }
    }
  }

  function merge(p: Piece) {
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c]) board[p.y + r][p.x + c] = p.shape[r][c];
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((v) => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array<number>(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      lines += cleared;
      addScore((LINE_SCORES[cleared] ?? 0) * level);
      level = Math.floor(lines / LINES_PER_LEVEL) + 1;
      dropInterval = Math.max(MIN_DROP_INTERVAL, START_DROP_INTERVAL - (level - 1) * DROP_STEP);
    }
  }

  function ghostY(p: Piece): number {
    let gy = p.y;
    while (!collide(p.shape, p.x, gy + 1)) gy++;
    return gy;
  }

  function hardDrop(p: Piece) {
    const gy = ghostY(p);
    addScore((gy - p.y) * HARD_DROP_POINTS);
    p.y = gy;
    lockPiece();
  }

  function softDrop(p: Piece) {
    if (!collide(p.shape, p.x, p.y + 1)) {
      p.y++;
      addScore(SOFT_DROP_POINTS);
    } else {
      lockPiece();
    }
  }

  function move(p: Piece, dx: number) {
    if (!collide(p.shape, p.x + dx, p.y)) p.x += dx;
  }

  function spawn() {
    current = next ?? randomPiece();
    next = randomPiece();
    if (collide(current.shape, current.x, current.y)) goGameOver();
  }

  function lockPiece() {
    if (!current) return;
    merge(current);
    clearLines();
    spawn();
  }

  function initGame() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = START_DROP_INTERVAL;
    dropAccum = 0;
    current = null;
    next = null;
  }

  function startGame() {
    initGame();
    next = randomPiece();
    setState("playing");
    spawn();
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state !== "playing" || !current) return;
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) current.y++;
      else lockPiece();
    }
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  interface BlockStyle {
    alpha?: number;
    glow?: boolean;
  }

  function drawBlock(px: number, py: number, type: number, { alpha = 1, glow = false }: BlockStyle = {}) {
    const color = COLORS[type];
    if (!color) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW;
    }
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, BLOCK - 2, BLOCK - 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLOR_HIGHLIGHT;
    ctx.fillRect(px + 1, py + 1, BLOCK - 2, 4);
    ctx.restore();
  }

  function drawCell(col: number, row: number, type: number, style?: BlockStyle) {
    drawBlock(BOARD_X + col * BLOCK, BOARD_Y + row * BLOCK, type, style);
  }

  function drawPiece(p: Piece, row: number, style: BlockStyle) {
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++) drawCell(p.x + c, row + r, p.shape[r][c], style);
  }

  /** Siguiente pieza centrada en la caja 4×4 (mismo offset que drawNext del original). */
  function drawNextPiece() {
    if (!next) return;
    const shape = next.shape;
    const offX = Math.floor((NEXT_CELLS - shape[0].length) / 2);
    const offY = Math.floor((NEXT_CELLS - shape.length) / 2);
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        drawBlock(NEXT_X + (offX + c) * BLOCK, NEXT_Y + (offY + r) * BLOCK, shape[r][c]);
  }

  function drawGrid() {
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(BOARD_X + c * BLOCK, BOARD_Y);
      ctx.lineTo(BOARD_X + c * BLOCK, BOARD_Y + BOARD_H);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(BOARD_X, BOARD_Y + r * BLOCK);
      ctx.lineTo(BOARD_X + BOARD_W, BOARD_Y + r * BLOCK);
    }
    ctx.stroke();
  }

  function drawFrame(x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = COLOR_FRAME;
    ctx.shadowColor = COLOR_FRAME;
    ctx.shadowBlur = GLOW;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.restore();
  }

  function drawNextBox() {
    ctx.fillStyle = COLOR_LABEL;
    ctx.font = `10px ${pixelFont}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SIGUIENTE", NEXT_X, NEXT_LABEL_Y);
    drawFrame(NEXT_X, NEXT_Y, NEXT_SIZE, NEXT_SIZE);
  }

  function draw() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);
    drawGrid();

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) drawCell(c, r, board[r][c]);

    // La pieza que colisiona al aparecer (fin de partida) no se dibuja, como en el original.
    if (current && state !== "gameover") {
      drawPiece(current, ghostY(current), { alpha: 0.2 });
      drawPiece(current, current.y, { glow: true });
    }

    drawFrame(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    drawNextBox();
    drawNextPiece();
  }

  // ── Loop principal ──────────────────────────────────────────────────────────
  function loop(ts: number) {
    if (destroyed) return;
    const dt = lastTime === null ? 0 : Math.min(ts - lastTime, MAX_DT);
    lastTime = ts;
    update(dt);
    draw();
    emitStats();
    rafId = requestAnimationFrame(loop);
  }

  // ── API pública ─────────────────────────────────────────────────────────────
  function pause() {
    if (destroyed || state !== "playing") return;
    setState("paused");
  }

  function resume() {
    if (destroyed || state !== "paused") return;
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

  // ── Input ───────────────────────────────────────────────────────────────────
  // Acciones por pulsación (keydown); mover, rotar y bajar usan el autorepeat del SO.
  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (state !== "gameover") e.preventDefault();

    if (e.code === "KeyP" || e.code === "Escape") {
      if (e.repeat) return;
      if (state === "paused") resume();
      else pause();
      return;
    }

    if (e.code === "Space") {
      if (e.repeat) return;
      // El pulso que arranca la partida no hace hard drop.
      if (state === "ready") startGame();
      else if (state === "playing" && current) hardDrop(current);
      return;
    }

    if (state !== "playing" || !current) return;
    switch (e.code) {
      case "ArrowLeft":
        move(current, -1);
        break;
      case "ArrowRight":
        move(current, 1);
        break;
      case "ArrowDown":
        softDrop(current);
        break;
      case "ArrowUp":
      case "KeyX":
        tryRotate(current);
        break;
    }
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

  // ── Arranque: estado `ready` con tablero vacío ──────────────────────────────
  initGame();
  cb.onStateChange(state);
  emitStats();
  rafId = requestAnimationFrame(loop);

  return { pause, resume, restart, end, destroy };
};
