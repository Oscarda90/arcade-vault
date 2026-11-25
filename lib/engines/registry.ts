import { createAsteroids } from "./asteroids";
import { createBreakout } from "./breakout";
import { createTetris } from "./tetris";
import type { EngineFactory, EngineStats } from "./types";

/** Todo lo que el reproductor necesita de un juego: motor, overlay de inicio y HUD inicial. */
export interface EngineEntry {
  factory: EngineFactory;
  startLabel: string;
  controls: { keys: string[]; action: string }[];
  initialStats: EngineStats;
}

export const ENGINES: Partial<Record<string, EngineEntry>> = {
  rocas: {
    factory: createAsteroids,
    startLabel: "PULSA ESPACIO PARA EMPEZAR",
    controls: [
      { keys: ["←", "→"], action: "ROTAR" },
      { keys: ["↑"], action: "PROPULSAR" },
      { keys: ["ESPACIO"], action: "DISPARAR" },
      { keys: ["P", "ESC"], action: "PAUSA" },
    ],
    initialStats: { score: 0, lives: 3, level: 1, extras: [] },
  },
  caida: {
    factory: createTetris,
    startLabel: "PULSA ESPACIO PARA EMPEZAR",
    controls: [
      { keys: ["←", "→"], action: "MOVER" },
      { keys: ["↑", "X"], action: "ROTAR" },
      { keys: ["↓"], action: "BAJAR" },
      { keys: ["ESPACIO"], action: "CAÍDA" },
      { keys: ["P", "ESC"], action: "PAUSA" },
    ],
    initialStats: { score: 0, level: 1, extras: [{ key: "lines", label: "Líneas", value: "0" }] },
  },
  "bloque-buster": {
    factory: createBreakout,
    startLabel: "PULSA ESPACIO PARA EMPEZAR",
    controls: [
      { keys: ["←", "→", "RATÓN"], action: "MOVER" },
      { keys: ["ESPACIO", "CLIC"], action: "LANZAR" },
      { keys: ["P", "ESC"], action: "PAUSA" },
    ],
    initialStats: { score: 0, lives: 3, level: 1, extras: [] },
  },
};

export function getEngine(id: string): EngineEntry | undefined {
  return ENGINES[id];
}
