// Port de references/started-games/04-arkanoid/game.js a un motor sin globals.
// Todo el estado vive dentro del closure de createBreakout().

import type {
  EngineCallbacks,
  EngineFactory,
  EngineState,
  EngineStats,
  GameEngine,
} from "./types";
import { statsEqual } from "./stats";
import { LEVELS, type BrickColor } from "./breakout-levels";
import { SCORE_MAX } from "@/lib/games";

// ── Paleta (mismos valores que los tokens de app/globals.css) ────────────────
const BRICK_COLORS: Record<BrickColor, string> = {
  cyan: "#00f5ff", // --cyan
  yellow: "#f5ff00", // --yellow
  magenta: "#ff006e", // --magenta
  green: "#00ff88", // --green
  red: "#d97a3a", // --bronze
  hotpink: "#e6e9ff", // --ink
  gray: "#c7d0e0", // --silver
};
const COLOR_PADDLE = "#00f5ff"; // --cyan
const COLOR_BALL = "#f5ff00"; // --yellow
const COLOR_HIGHLIGHT = "rgba(255, 255, 255, 0.12)";
const COLOR_BG = "#000";
const GLOW = 12;

const EXPLOSION_DURATION = 0.15; // s
const EXPLOSION_SCALE = 0.4; // crece de ×1,0 a ×1,4

// ── Constantes ────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
const MAX_DT = 0.05; // s

const PADDLE_W = 81;
const PADDLE_H = 14;
const PADDLE_Y = 560;
const PADDLE_SPEED = 400; // px/s

const BALL_SIZE = 16;
const BASE_BALL_SPEED = Math.hypot(200, 300); // ≈ 360,6 px/s (BASE_BALL_VX/VY)
const SERVE_ANGLE = Math.atan2(200, 300); // ≈ 33,7° desde la vertical, hacia la derecha
const MAX_SPEED_MULT = 2.0;
const SPEED_STEP = 1.1;
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° desde la vertical
const PADDLE_TOLERANCE = 8; // px bajo la paleta que aún cuentan como rebote
const MAX_SUBSTEP = 8; // px por sub-paso

const BLOCK_COLS = 10;
const BLOCK_W = 64;
const BLOCK_H = 24;
const BLOCKS_ORIGIN_X = (W - BLOCK_COLS * BLOCK_W) / 2; // 80
const BLOCKS_ORIGIN_Y = 80;

const START_LIVES = 3;
const POINTS_PER_BRICK = 10; // × nivel

const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "Space", "KeyP", "Escape"]);

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Rapidez de la pelota en el nivel n: base × min(1,1^(n−1), 2,0). */
function ballSpeed(level: number): number {
  return BASE_BALL_SPEED * Math.min(SPEED_STEP ** (level - 1), MAX_SPEED_MULT);
}

interface Brick {
  x: number;
  y: number;
  color: BrickColor;
  alive: boolean;
}

interface Explosion {
  x: number;
  y: number;
  color: BrickColor;
  elapsed: number; // s
}

export const createBreakout: EngineFactory = (
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

  // ── Input ───────────────────────────────────────────────────────────────────
  const keys: Record<string, boolean> = {};

  function clearInput() {
    for (const k in keys) keys[k] = false;
  }

  // ── Estado del juego ────────────────────────────────────────────────────────
  const paddle = { x: (W - PADDLE_W) / 2, y: PADDLE_Y };
  const ball = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Pelota pegada a la paleta hasta el saque (flag interno de `playing`). */
  let stuck = true;
  let bricks: Brick[] = [];
  let explosions: Explosion[] = [];
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
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
    const stats: EngineStats = { score, lives, level, extras: [] };
    if (statsEqual(lastStats, stats)) return;
    lastStats = stats;
    cb.onStats(stats);
  }

  function goGameOver() {
    setState("gameover");
    emitStats();
    cb.onGameOver(score);
  }

  // ── Niveles y saque ─────────────────────────────────────────────────────────
  function loadPattern(n: number) {
    const def = LEVELS[(n - 1) % LEVELS.length];
    bricks = def.blocks.map((b) => ({
      x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
      y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
      color: b.color,
      alive: true,
    }));
  }

  function stickBall() {
    stuck = true;
    ball.vx = 0;
    ball.vy = 0;
    followPaddle();
  }

  function followPaddle() {
    ball.x = paddle.x + (PADDLE_W - BALL_SIZE) / 2;
    ball.y = PADDLE_Y - BALL_SIZE;
  }

  function launchBall() {
    if (!stuck) return;
    stuck = false;
    const v = ballSpeed(level);
    ball.vx = v * Math.sin(SERVE_ANGLE);
    ball.vy = -v * Math.cos(SERVE_ANGLE);
  }

  function initGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    paddle.x = (W - PADDLE_W) / 2;
    explosions = [];
    loadPattern(level);
    stickBall();
  }

  function startGame() {
    clearInput();
    initGame();
    setState("playing");
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function updatePaddle(dt: number) {
    if (keys["ArrowLeft"]) paddle.x -= PADDLE_SPEED * dt;
    if (keys["ArrowRight"]) paddle.x += PADDLE_SPEED * dt;
    paddle.x = clamp(paddle.x, 0, W - PADDLE_W);
  }

  function bounceWalls() {
    if (ball.x <= 0) {
      ball.x = 0;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + BALL_SIZE >= W) {
      ball.x = W - BALL_SIZE;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y <= 0) {
      ball.y = 0;
      ball.vy = Math.abs(ball.vy);
    }
  }

  /** Rebote con ángulo según el punto de impacto: centro → vertical, borde → ±60°. */
  function bouncePaddle() {
    if (
      ball.vy > 0 &&
      ball.x + BALL_SIZE > paddle.x &&
      ball.x < paddle.x + PADDLE_W &&
      ball.y + BALL_SIZE >= PADDLE_Y &&
      ball.y + BALL_SIZE <= PADDLE_Y + PADDLE_H + PADDLE_TOLERANCE
    ) {
      const ballCenter = ball.x + BALL_SIZE / 2;
      const paddleCenter = paddle.x + PADDLE_W / 2;
      const offset = clamp((ballCenter - paddleCenter) / (PADDLE_W / 2), -1, 1);
      const angle = offset * MAX_BOUNCE_ANGLE;
      const v = ballSpeed(level);
      ball.y = PADDLE_Y - BALL_SIZE;
      ball.vx = v * Math.sin(angle);
      ball.vy = -v * Math.cos(angle);
    }
  }

  /** AABB contra bloques vivos: rompe como mucho uno por sub-paso e invierte vy. */
  function hitBrick(): Brick | null {
    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x < b.x + BLOCK_W &&
        ball.x + BALL_SIZE > b.x &&
        ball.y < b.y + BLOCK_H &&
        ball.y + BALL_SIZE > b.y
      ) {
        b.alive = false;
        ball.vy = -ball.vy;
        return b;
      }
    }
    return null;
  }

  function breakBrick(b: Brick) {
    explosions.push({ x: b.x, y: b.y, color: b.color, elapsed: 0 });
    score = Math.min(score + POINTS_PER_BRICK * level, SCORE_MAX);
    if (bricks.every((b) => !b.alive)) nextLevel();
  }

  /** Nivel completado: patrón siguiente (cíclico), NIVEL +1, pelota a la paleta. */
  function nextLevel() {
    level++;
    loadPattern(level);
    stickBall();
  }

  function loseBall() {
    lives--;
    if (lives <= 0) {
      lives = 0;
      goGameOver();
    } else {
      stickBall();
    }
  }

  function updateBall(dt: number) {
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * dt) / MAX_SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      bounceWalls();
      bouncePaddle();
      const hit = hitBrick();
      if (hit) {
        breakBrick(hit);
        if (stuck) return; // nivel completado: la pelota ya está en la paleta
      }
      if (ball.y > H) {
        loseBall();
        return;
      }
    }
  }

  function updateExplosions(dt: number) {
    for (const e of explosions) e.elapsed += dt;
    explosions = explosions.filter((e) => e.elapsed < EXPLOSION_DURATION);
  }

  function update(dt: number) {
    if (state !== "playing") return;
    updateExplosions(dt);
    updatePaddle(dt);
    if (stuck) {
      followPaddle();
      return;
    }
    updateBall(dt);
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  function drawBricks() {
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = BRICK_COLORS[b.color];
      ctx.fillRect(b.x + 1, b.y + 1, BLOCK_W - 2, BLOCK_H - 2);
      ctx.fillStyle = COLOR_HIGHLIGHT;
      ctx.fillRect(b.x + 1, b.y + 1, BLOCK_W - 2, 4);
    }
  }

  /** Rectángulo del color del bloque que crece ×1,0 → ×1,4 y se desvanece en 150 ms. */
  function drawExplosions() {
    for (const e of explosions) {
      const t = Math.min(e.elapsed / EXPLOSION_DURATION, 1);
      const scale = 1 + EXPLOSION_SCALE * t;
      const w = BLOCK_W * scale;
      const h = BLOCK_H * scale;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = BRICK_COLORS[e.color];
      ctx.fillRect(e.x + (BLOCK_W - w) / 2, e.y + (BLOCK_H - h) / 2, w, h);
      ctx.restore();
    }
  }

  function drawPaddle() {
    ctx.save();
    ctx.shadowColor = COLOR_PADDLE;
    ctx.shadowBlur = GLOW;
    ctx.fillStyle = COLOR_PADDLE;
    ctx.fillRect(paddle.x, paddle.y, PADDLE_W, PADDLE_H);
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    ctx.shadowColor = COLOR_BALL;
    ctx.shadowBlur = GLOW;
    ctx.fillStyle = COLOR_BALL;
    ctx.beginPath();
    ctx.arc(ball.x + BALL_SIZE / 2, ball.y + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);
    drawBricks();
    drawExplosions();
    drawPaddle();
    drawBall();
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
    clearInput();
    setState("paused");
  }

  function resume() {
    if (destroyed || state !== "paused") return;
    // Evita que una flecha pulsada durante la pausa siga moviendo la paleta.
    clearInput();
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

    if (e.code === "KeyP" || e.code === "Escape") {
      if (e.repeat) return;
      if (state === "paused") resume();
      else pause();
      return;
    }

    if (e.code === "Space") {
      if (e.repeat) return;
      // El Espacio que arranca la partida no lanza la pelota.
      if (state === "ready") startGame();
      else if (state === "playing") launchBall();
      return;
    }

    keys[e.code] = true;
  }

  // Evita que Espacio al soltarse active el botón con foco.
  function onKeyUp(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (state !== "gameover") e.preventDefault();
    keys[e.code] = false;
  }

  // ── Ratón (sobre el canvas, en coordenadas lógicas) ─────────────────────────
  function onMouseMove(e: MouseEvent) {
    if (state !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const mouseX = ((e.clientX - rect.left) * W) / rect.width;
    paddle.x = clamp(mouseX - PADDLE_W / 2, 0, W - PADDLE_W);
    if (stuck) followPaddle();
  }

  function onMouseDown() {
    if (state === "playing") launchBall();
  }

  function onVisibilityChange() {
    if (document.hidden) pause();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mousedown", onMouseDown);
  }

  // ── Arranque: estado `ready` con el patrón 1 y la pelota sobre la paleta ────
  initGame();
  cb.onStateChange(state);
  emitStats();
  rafId = requestAnimationFrame(loop);

  return { pause, resume, restart, end, destroy };
};
