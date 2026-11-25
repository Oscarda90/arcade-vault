// Port de references/started-games/02-asteroids/game.js a un motor sin globals.
// Todo el estado vive dentro del closure de createAsteroids().

import type {
  EngineCallbacks,
  EngineFactory,
  EngineState,
  EngineStats,
  GameEngine,
} from "./types";
import { statsEqual } from "./stats";

// ── Paleta neón (mismos valores que los tokens de app/globals.css) ────────────
const COLOR_SHIP = "#00f5ff"; // --cyan
const COLOR_FLAME = "#f5ff00"; // --yellow
const COLOR_BULLET = "#f5ff00"; // --yellow
const COLOR_ASTEROID = "#ff006e"; // --magenta
const COLOR_POWERUP = "#00ff88"; // --green
const COLOR_BG = "#000";
const GLOW = 12;

// ── Constantes ────────────────────────────────────────────────────────────────
const W = 800;
const H = 600;
const MAX_DT = 0.05;

const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_DURATION = 5;
const POWERUP_TTL = 12;
const POWERUP_GUARANTEED_KILLS = 5;
const TRIPLE_SPREAD = 0.18;

const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

const START_LIVES = 3;
const RESPAWN_DELAY = 2;
const SPAWN_INVINCIBILITY = 3;
const SHOOT_COOLDOWN = 0.2;
const SAFE_DIST = 130;

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown", // sin acción en el juego; solo evita el scroll de la página
  "Space",
  "KeyP",
  "Escape",
]);

// ── Utils ─────────────────────────────────────────────────────────────────────
type Point = { x: number; y: number };
const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export const createAsteroids: EngineFactory = (
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
  const justPressed: Record<string, boolean> = {};

  function pressed(code: string): boolean {
    const val = !!justPressed[code];
    justPressed[code] = false;
    return val;
  }

  function clearInput() {
    for (const k in keys) keys[k] = false;
    for (const k in justPressed) justPressed[k] = false;
  }

  // ── Bullet ──────────────────────────────────────────────────────────────────
  class Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ttl = 1.1;
    radius = 2;
    dead = false;

    constructor(x: number, y: number, angle: number) {
      const SPEED = 520;
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * SPEED;
      this.vy = Math.sin(angle) * SPEED;
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      ctx.fillStyle = COLOR_BULLET;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Asteroid ────────────────────────────────────────────────────────────────
  class Asteroid {
    x: number;
    y: number;
    size: number;
    radius: number;
    dead = false;
    vx: number;
    vy: number;
    rotSpeed: number;
    rot: number;
    verts: [number, number][] = [];

    constructor(x: number, y: number, size = 3) {
      this.x = x;
      this.y = y;
      this.size = size;
      this.radius = RADII[size];

      const angle = rand(0, Math.PI * 2);
      const speed = SPEEDS[size] + rand(-15, 15);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.rotSpeed = rand(-1.2, 1.2);
      this.rot = rand(0, Math.PI * 2);

      // Polígono irregular
      const n = randInt(8, 13);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.rot += this.rotSpeed * dt;
    }

    split(): Asteroid[] {
      if (this.size <= 1) return [];
      return [
        new Asteroid(this.x, this.y, this.size - 1),
        new Asteroid(this.x, this.y, this.size - 1),
      ];
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.strokeStyle = COLOR_ASTEROID;
      ctx.shadowColor = COLOR_ASTEROID;
      ctx.shadowBlur = GLOW;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(this.verts[0][0], this.verts[0][1]);
      for (let i = 1; i < this.verts.length; i++)
        ctx.lineTo(this.verts[i][0], this.verts[i][1]);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── PowerUp ─────────────────────────────────────────────────────────────────
  class PowerUp {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius = 12;
    ttl = POWERUP_TTL;
    dead = false;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(20, 40);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }

    update(dt: number) {
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
      const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
      ctx.save();
      ctx.shadowColor = COLOR_POWERUP;
      ctx.shadowBlur = GLOW;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = COLOR_POWERUP;
      ctx.lineWidth = 2;
      const r = this.radius * pulse;
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
      ctx.fillStyle = COLOR_POWERUP;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("3x", this.x, this.y);
      ctx.restore();
    }
  }

  // ── Ship ────────────────────────────────────────────────────────────────────
  class Ship {
    x = W / 2;
    y = H / 2;
    angle = -Math.PI / 2;
    vx = 0;
    vy = 0;
    radius = 12;
    thrusting = false;
    invincible = SPAWN_INVINCIBILITY;
    shootCooldown = 0;
    tripleShot = 0;
    dead = false;

    reset() {
      this.x = W / 2;
      this.y = H / 2;
      this.angle = -Math.PI / 2;
      this.vx = 0;
      this.vy = 0;
      this.radius = 12;
      this.thrusting = false;
      this.invincible = SPAWN_INVINCIBILITY;
      this.shootCooldown = 0;
      this.dead = false;
    }

    update(dt: number) {
      if (this.dead) return;
      if (this.invincible > 0) this.invincible -= dt;
      if (this.shootCooldown > 0) this.shootCooldown -= dt;
      if (this.tripleShot > 0) this.tripleShot = Math.max(0, this.tripleShot - dt);

      const ROT = 3.5; // rad/s
      const THRUST = 260; // px/s²
      const DRAG = 0.987;

      if (keys["ArrowLeft"]) this.angle -= ROT * dt;
      if (keys["ArrowRight"]) this.angle += ROT * dt;

      this.thrusting = !!keys["ArrowUp"];
      if (this.thrusting) {
        this.vx += Math.cos(this.angle) * THRUST * dt;
        this.vy += Math.sin(this.angle) * THRUST * dt;
      }

      this.vx *= DRAG;
      this.vy *= DRAG;
      this.x = wrap(this.x + this.vx * dt, W);
      this.y = wrap(this.y + this.vy * dt, H);
    }

    tryShoot(): Bullet[] {
      if (this.shootCooldown > 0 || this.dead) return [];
      this.shootCooldown = SHOOT_COOLDOWN;
      const NOSE = 21;
      const ox = this.x + Math.cos(this.angle) * NOSE;
      const oy = this.y + Math.sin(this.angle) * NOSE;
      if (this.tripleShot > 0) {
        return [
          new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
          new Bullet(ox, oy, this.angle),
          new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
        ];
      }
      return [new Bullet(ox, oy, this.angle)];
    }

    draw() {
      if (this.dead) return;
      // Parpadeo durante invencibilidad de reaparición
      if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.strokeStyle = COLOR_SHIP;
      ctx.shadowColor = COLOR_SHIP;
      ctx.shadowBlur = GLOW;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";

      // Silueta clásica: triángulo con muesca trasera
      ctx.beginPath();
      ctx.moveTo(20, 0); // nariz
      ctx.lineTo(-12, -9); // ala izquierda
      ctx.lineTo(-7, 0); // muesca trasera
      ctx.lineTo(-12, 9); // ala derecha
      ctx.closePath();
      ctx.stroke();

      // Llama del propulsor
      if (this.thrusting && Math.random() > 0.35) {
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-8 - rand(6, 14), 0);
        ctx.lineTo(-8, 4);
        ctx.strokeStyle = COLOR_FLAME;
        ctx.shadowColor = COLOR_FLAME;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ── Partículas (explosión) ──────────────────────────────────────────────────
  class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    ttl: number;
    rgb: string;
    dead = false;

    constructor(x: number, y: number, rgb: string) {
      this.x = x;
      this.y = y;
      this.rgb = rgb;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(30, 130);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.life = rand(0.4, 1.1);
      this.ttl = this.life;
    }

    update(dt: number) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
      if (this.ttl <= 0) this.dead = true;
    }

    draw() {
      const alpha = this.ttl / this.life;
      ctx.strokeStyle = `rgba(${this.rgb},${alpha.toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
      ctx.stroke();
    }
  }

  const RGB_SHIP = hexToRgb(COLOR_SHIP);
  const RGB_ASTEROID = hexToRgb(COLOR_ASTEROID);

  // ── Estado del juego ────────────────────────────────────────────────────────
  let ship = new Ship();
  let bullets: Bullet[] = [];
  let asteroids: Asteroid[] = [];
  let particles: Particle[] = [];
  let powerUps: PowerUp[] = [];
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
  let state: EngineState = "ready";
  let stateBeforePause: EngineState = "playing";
  let deadTimer = 0;
  let powerUpSpawned = false;
  let killsSinceSpawn = 0;

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
    const powerUp = Math.round(ship.tripleShot * 10) / 10;
    const stats: EngineStats = {
      score,
      lives,
      level,
      extras:
        powerUp > 0
          ? [{ key: "3x", label: "3X", value: `${powerUp.toFixed(1)}s`, tone: "green" }]
          : [],
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

  function spawnAsteroids(count: number) {
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
      asteroids.push(new Asteroid(x, y, 3));
    }
  }

  function initGame() {
    ship = new Ship();
    bullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    score = 0;
    lives = START_LIVES;
    level = 1;
    deadTimer = 0;
    spawnAsteroids(3 + level);
  }

  function nextLevel() {
    level++;
    bullets = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    ship.reset();
    spawnAsteroids(3 + level);
  }

  function explode(x: number, y: number, count: number, rgb: string) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y, rgb));
  }

  function killShip() {
    explode(ship.x, ship.y, 14, RGB_SHIP);
    ship.dead = true;
    lives--;
    if (lives <= 0) {
      goGameOver();
    } else {
      deadTimer = RESPAWN_DELAY;
      setState("dead");
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state === "paused") return;

    if (state === "ready") {
      // Campo de asteroides de fondo; la nave no se controla
      asteroids.forEach((a) => a.update(dt));
      if (pressed("Space")) {
        initGame();
        setState("playing");
      }
      return;
    }

    if (state === "gameover") {
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      return;
    }

    if (state === "dead") {
      deadTimer -= dt;
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      asteroids.forEach((a) => a.update(dt));
      if (deadTimer <= 0) {
        ship.reset();
        setState("playing");
      }
      return;
    }

    // Disparar
    if (pressed("Space")) {
      bullets.push(...ship.tryShoot());
    }

    ship.update(dt);
    bullets.forEach((b) => b.update(dt));
    asteroids.forEach((a) => a.update(dt));
    particles.forEach((p) => p.update(dt));
    powerUps.forEach((p) => p.update(dt));

    bullets = bullets.filter((b) => !b.dead);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((p) => !p.dead);

    for (const p of powerUps) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.tripleShot = POWERUP_DURATION;
      }
    }

    // Bala vs asteroide
    const newAsteroids: Asteroid[] = [];
    for (const b of bullets) {
      for (const a of asteroids) {
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5, RGB_ASTEROID);
          newAsteroids.push(...a.split());
          if (!powerUpSpawned) {
            killsSinceSpawn++;
            const guaranteed = killsSinceSpawn >= POWERUP_GUARANTEED_KILLS;
            if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
              powerUps.push(new PowerUp(a.x, a.y));
              powerUpSpawned = true;
            }
          }
        }
      }
    }
    asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
    bullets = bullets.filter((b) => !b.dead);

    // Nave vs asteroide
    if (ship.invincible <= 0) {
      for (const a of asteroids) {
        if (dist(ship, a) < ship.radius + a.radius * 0.82) {
          killShip();
          break;
        }
      }
    }

    // Nivel completado
    if (state === "playing" && asteroids.length === 0) nextLevel();
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  function draw() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    particles.forEach((p) => p.draw());
    asteroids.forEach((a) => a.draw());
    powerUps.forEach((p) => p.draw());
    bullets.forEach((b) => b.draw());
    if (state !== "ready") ship.draw();
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
    if (destroyed) return;
    if (state !== "playing" && state !== "dead") return;
    stateBeforePause = state;
    setState("paused");
  }

  function resume() {
    if (destroyed || state !== "paused") return;
    // Evita disparos/arranques por teclas pulsadas durante la pausa
    clearInput();
    setState(stateBeforePause);
  }

  function restart() {
    if (destroyed) return;
    clearInput();
    initGame();
    setState("playing");
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

    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
  }

  function onKeyUp(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (!GAME_KEYS.has(e.code)) return;
    if (state !== "gameover") e.preventDefault();
    keys[e.code] = false;
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

  // ── Arranque: estado `ready` con asteroides de fondo ────────────────────────
  initGame();
  cb.onStateChange(state);
  emitStats();
  rafId = requestAnimationFrame(loop);

  return { pause, resume, restart, end, destroy };
};
