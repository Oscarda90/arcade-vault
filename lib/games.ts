// Tipos del catálogo. Los datos viven en Supabase (public.games); se leen con lib/data/games.ts.

export type GameCategory = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";
export type GameColor = "cyan" | "magenta" | "yellow" | "green";

export interface Game {
  /** slug usado en /juegos/[id] */
  id: string;
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  /** clase CSS en globals.css, ej. "cover-bricks" */
  cover: string;
  color: GameColor;
  /** true si tiene motor real y acepta puntajes */
  playable: boolean;
  /** mejor puntaje global; 0 = sin puntajes */
  best: number;
  /** nº de puntajes guardados */
  plays: number;
}

export interface ScoreRow {
  rank: number;
  /** profiles.username */
  name: string;
  score: number;
  /** "DD/MM/YYYY", formateado en servidor (UTC) */
  date: string;
}

/** Cota superior de un puntaje (igual al check de public.scores). */
export const SCORE_MAX = 9_999_999;

export const CATS: ("TODOS" | GameCategory)[] = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];

/** 12400 → "12.4K", 1250000 → "1.3M", 0 → "0". */
export function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
