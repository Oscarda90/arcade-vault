// Port de references/started-games/04-arkanoid/levels.js.
// El campo `speed` del original no se copia: la velocidad la calcula el motor.

export type BrickColor =
  | "gray"
  | "red"
  | "yellow"
  | "cyan"
  | "magenta"
  | "hotpink"
  | "green";

export interface BrickDef {
  col: number;
  row: number;
  color: BrickColor;
}

export interface LevelDef {
  blocks: BrickDef[];
}

const ROWS = 6;
const COLS = 10;

export const LEVELS: readonly LevelDef[] = (() => {
  const rowColors1: BrickColor[] = ["red", "yellow", "cyan", "magenta", "hotpink", "green"];
  const rowColors2: BrickColor[] = ["gray", "cyan", "hotpink", "yellow", "magenta", "green"];
  const rowColors4: BrickColor[] = ["cyan", "magenta", "green", "yellow", "hotpink", "red"];

  // 1 — parrilla completa 10×6
  const l1: BrickDef[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) l1.push({ col, row, color: rowColors1[row] });

  // 2 — pirámide
  const l2: BrickDef[] = [];
  const pyStart = [4, 3, 2, 1, 0, 0];
  const pyEnd = [5, 6, 7, 8, 9, 9];
  for (let row = 0; row < ROWS; row++)
    for (let col = pyStart[row]; col <= pyEnd[row]; col++)
      l2.push({ col, row, color: rowColors2[row] });

  // 3 — ajedrez
  const l3: BrickDef[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if ((col + row) % 2 === 0) l3.push({ col, row, color: row < 3 ? "yellow" : "magenta" });

  // 4 — filas con huecos
  const gaps4 = [
    [2, 5, 8],
    [0, 4, 7, 9],
    [1, 3, 6],
    [2, 5, 8, 9],
    [0, 4, 7],
    [1, 3, 6, 9],
  ];
  const l4: BrickDef[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      if (!gaps4[row].includes(col)) l4.push({ col, row, color: rowColors4[row] });

  // 5 — marco + cruz
  const l5: BrickDef[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const isFrame = col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1;
      const isCross = col === 4 || row === 2;
      if (isFrame || isCross)
        l5.push({ col, row, color: isCross && !isFrame ? "hotpink" : "cyan" });
    }

  return [{ blocks: l1 }, { blocks: l2 }, { blocks: l3 }, { blocks: l4 }, { blocks: l5 }];
})();
