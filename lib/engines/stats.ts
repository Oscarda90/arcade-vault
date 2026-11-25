import type { EngineStats, HudExtra } from "./types";

function extrasEqual(a: HudExtra[] = [], b: HudExtra[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (x, i) =>
      x.key === b[i].key &&
      x.label === b[i].label &&
      x.value === b[i].value &&
      x.tone === b[i].tone,
  );
}

/** Igualdad por valor; los motores la usan para no llamar onStats cada frame. */
export function statsEqual(a: EngineStats | null, b: EngineStats): boolean {
  return (
    a !== null &&
    a.score === b.score &&
    a.lives === b.lives &&
    a.level === b.level &&
    extrasEqual(a.extras, b.extras)
  );
}
