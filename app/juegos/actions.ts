"use server";

import { updateTag } from "next/cache";
import { SCORE_MAX } from "@/lib/games";
import { createClient, SupabaseConfigError } from "@/lib/supabase/server";

export type ScoreErrorCode =
  | "auth" // sin sesión
  | "invalid" // score no entero o fuera de 1..SCORE_MAX, gameId inválido
  | "not_playable" // juego inexistente o playable = false
  | "config" // faltan env vars
  | "server"; // cualquier otro error de Supabase / red

export type ScoreResult = { ok: true } | { ok: false; error: ScoreErrorCode };

// Mismo formato que el check de public.games.id.
const GAME_ID_RE = /^[a-z0-9-]{2,32}$/;

// Códigos de Postgres que devuelve PostgREST.
const PG_RLS_VIOLATION = "42501"; // with check de la política de insert (juego no playable)
const PG_FK_VIOLATION = "23503"; // game_id inexistente
const PG_CHECK_VIOLATION = "23514"; // score fuera de rango

/**
 * Guarda un puntaje del usuario con sesión. Nunca lanza: siempre devuelve ScoreResult.
 * La BD valida lo mismo otra vez (RLS + check); esto es la primera barrera.
 */
export async function submitScore(gameId: string, score: number): Promise<ScoreResult> {
  if (
    typeof gameId !== "string" ||
    !GAME_ID_RE.test(gameId) ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > SCORE_MAX
  ) {
    return { ok: false, error: "invalid" };
  }

  try {
    let supabase;
    try {
      supabase = await createClient();
    } catch (err) {
      if (err instanceof SupabaseConfigError) {
        console.error(`[scores:submit] ${err.message}`);
        return { ok: false, error: "config" };
      }
      throw err;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, error: "auth" };

    const { error } = await supabase.from("scores").insert({ game_id: gameId, user_id: user.id, score });
    if (error) {
      if (error.code === PG_RLS_VIOLATION || error.code === PG_FK_VIOLATION) {
        return { ok: false, error: "not_playable" };
      }
      if (error.code === PG_CHECK_VIOLATION) return { ok: false, error: "invalid" };
      console.error("[scores:submit] Fallo al insertar:", error);
      return { ok: false, error: "server" };
    }

    updateTag("scores");
    return { ok: true };
  } catch (err) {
    console.error("[scores:submit] Error inesperado:", err);
    return { ok: false, error: "server" };
  }
}
