export type EngineState = "ready" | "playing" | "dead" | "paused" | "gameover";

/** Stat propia de un juego que el HUD pinta tras NIVEL (LÍNEAS, 3X…). */
export interface HudExtra {
  /** estable, para React: "lines", "3x" */
  key: string;
  /** "Líneas", "3X" */
  label: string;
  /** ya formateado: "12", "4.2s" */
  value: string;
  /** omitido → cyan (color por defecto de .hud-stat .v) */
  tone?: "magenta" | "yellow" | "green";
}

export interface EngineStats {
  score: number;
  /** omitido → el HUD no muestra VIDAS */
  lives?: number;
  /** omitido → el HUD no muestra NIVEL */
  level?: number;
  /** en orden, después de NIVEL */
  extras?: HudExtra[];
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
