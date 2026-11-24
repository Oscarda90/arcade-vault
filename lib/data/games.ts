import "server-only";
import { cacheTag } from "next/cache";
import type { Game, GameCategory, GameColor, ScoreRow } from "@/lib/games";
import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/lib/supabase/database.types";

// Lecturas públicas cacheadas del catálogo y los rankings.
// Tags: "games" (catálogo) y "scores" (rankings y stats; submitScore hace updateTag("scores")).
// Errores de config / red se registran y se relanzan: los captura el error boundary de la ruta.

type LeaderboardRow = Database["public"]["Views"]["leaderboard"]["Row"];

const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function fail(where: string, err: unknown): never {
  console.error(`[data/games] ${where}:`, err);
  throw err instanceof Error ? err : new Error(`[data/games] ${where}: ${JSON.stringify(err)}`);
}

function toScoreRow(r: LeaderboardRow): ScoreRow {
  return {
    rank: r.rank ?? 0,
    name: r.username ?? "",
    score: r.score ?? 0,
    date: r.achieved_at ? DATE_FMT.format(new Date(r.achieved_at)) : "",
  };
}

/** Catálogo completo ordenado por sort_order, con best/plays reales. */
export async function getGames(): Promise<Game[]> {
  "use cache";
  cacheTag("games", "scores");

  let supabase;
  try {
    supabase = createPublicClient();
  } catch (err) {
    fail("config", err);
  }

  const [games, stats] = await Promise.all([
    supabase.from("games").select("*").order("sort_order"),
    supabase.from("game_stats").select("*"),
  ]);
  if (games.error) fail("games", games.error);
  if (stats.error) fail("game_stats", stats.error);

  const byGame = new Map(stats.data.map((s) => [s.game_id, s]));
  return games.data.map((g) => {
    const s = byGame.get(g.id);
    return {
      id: g.id,
      title: g.title,
      short: g.short,
      long: g.long,
      cat: g.cat as GameCategory, // garantizado por el check de la tabla
      cover: g.cover,
      color: g.color as GameColor, // garantizado por el check de la tabla
      playable: g.playable,
      best: s?.best ?? 0,
      plays: s?.plays ?? 0,
    };
  });
}

/** Un juego por id; undefined solo si no existe. */
export async function getGameById(id: string): Promise<Game | undefined> {
  const games = await getGames();
  return games.find((g) => g.id === id);
}

/** Top `limit` de un juego (mejor puntaje por usuario). */
export async function getLeaderboard(gameId: string, limit: number): Promise<ScoreRow[]> {
  "use cache";
  cacheTag("scores");

  let supabase;
  try {
    supabase = createPublicClient();
  } catch (err) {
    fail("config", err);
  }

  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("game_id", gameId)
    .lte("rank", limit)
    .order("rank");
  if (error) fail("leaderboard", error);
  return data.map(toScoreRow);
}

/** Top `limit` de todos los juegos en una sola query, agrupado por game_id. */
export async function getAllLeaderboards(limit: number): Promise<Record<string, ScoreRow[]>> {
  "use cache";
  cacheTag("scores");

  let supabase;
  try {
    supabase = createPublicClient();
  } catch (err) {
    fail("config", err);
  }

  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .lte("rank", limit)
    .order("game_id")
    .order("rank");
  if (error) fail("leaderboard", error);

  const out: Record<string, ScoreRow[]> = {};
  for (const r of data) {
    if (!r.game_id) continue;
    (out[r.game_id] ??= []).push(toScoreRow(r));
  }
  return out;
}
