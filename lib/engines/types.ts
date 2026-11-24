export type EngineState = "ready" | "playing" | "dead" | "paused" | "gameover";

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
  /** playing|dead → paused */
  pause(): void;
  /** paused → estado previo */
  resume(): void;
  /** cualquier estado → playing, stats iniciales */
  restart(): void;
  /** termina ya → gameover + onGameOver(score) */
  end(): void;
  /** cancela rAF, quita listeners; idempotente */
  destroy(): void;
}

export type EngineFactory = (
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
) => GameEngine;
