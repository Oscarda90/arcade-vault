import { createAsteroids } from "./asteroids";
import type { EngineFactory } from "./types";

export const ENGINES: Partial<Record<string, EngineFactory>> = {
  rocas: createAsteroids,
};

export function getEngine(id: string): EngineFactory | undefined {
  return ENGINES[id];
}
