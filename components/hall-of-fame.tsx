"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Game, ScoreRow } from "@/lib/games";
import { useSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/client";

const TOP = ["top1", "top2", "top3"];
const fmt = (n: number) => n.toLocaleString("es-ES");
const pad = (n: number) => String(n).padStart(2, "0");

// Solo se usa tras montar (TU MEJOR MARCA), así que no afecta a la hidratación.
const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Marca del usuario en un juego; null = sin fila. */
interface YourMark {
  rank: number;
  score: number;
  date: string;
}

/**
 * Mejor marca del usuario con sesión en `gameId`, leída con el browser client.
 * undefined = cargando / sin consultar.
 */
function useYourMark(gameId: string, enabled: boolean): YourMark | null | undefined {
  const [result, setResult] = useState<{ key: string; mark: YourMark | null } | null>(null);
  const key = enabled ? gameId : "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    (async () => {
      let mark: YourMark | null = null;
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from("leaderboard")
            .select("rank, score, achieved_at")
            .eq("game_id", key)
            .eq("user_id", user.id)
            .maybeSingle();
          if (error) console.error("[salon] Fallo al leer tu mejor marca:", error);
          if (data) {
            mark = {
              rank: data.rank ?? 0,
              score: data.score ?? 0,
              date: data.achieved_at ? DATE_FMT.format(new Date(data.achieved_at)) : "",
            };
          }
        }
      } catch (err) {
        console.error("[salon] Fallo al leer tu mejor marca:", err);
      }
      if (!cancelled) setResult({ key, mark });
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!key || result?.key !== key) return undefined;
  return result.mark;
}

function PodiumSlot({ row, place }: { row: ScoreRow | undefined; place: 1 | 2 | 3 }) {
  const cls = place === 1 ? "gold" : place === 2 ? "silver" : "bronze";
  return (
    <div className={"podium-slot " + cls + (row ? "" : " empty")}>
      {place === 1 && <div className="pixel text-[9px] tracking-[0.18em] text-gold">CAMPEÓN</div>}
      <div className={"rank-num" + (place === 1 ? " mt-1 text-4xl" : "")}>{pad(place)}</div>
      <div className="name">{row ? row.name : "---"}</div>
      {row && (
        <>
          <div className={"score" + (place === 1 ? " text-xl" : "")}>{fmt(row.score)}</div>
          <div className="date">{row.date}</div>
        </>
      )}
    </div>
  );
}

export function HallOfFame({ games, boards }: { games: Game[]; boards: Record<string, ScoreRow[]> }) {
  const { user, loading } = useSession();
  // Primera pestaña: el primer juego con ranking (los demás están en demo).
  const [tab, setTab] = useState(() => (games.find((g) => g.playable) ?? games[0])?.id ?? "");
  const game = games.find((g) => g.id === tab) ?? games[0];
  const rows = boards[tab] ?? [];
  const showYou = !!game?.playable && !!user && !loading;
  const yourMark = useYourMark(tab, showYou);

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel text-[10px]">LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA</p>
      </div>

      <div className="hall-tabs">
        {games.map((g) => (
          <button key={g.id} className={"chip" + (tab === g.id ? " active" : "")} onClick={() => setTab(g.id)}>
            {g.title}
          </button>
        ))}
      </div>

      {game && !game.playable ? (
        <div className="hall-table">
          <div className="hall-empty demo pixel">MODO DEMO · SIN RANKING</div>
        </div>
      ) : (
        <>
          <div className="podium">
            <PodiumSlot row={rows[1]} place={2} />
            <PodiumSlot row={rows[0]} place={1} />
            <PodiumSlot row={rows[2]} place={3} />
          </div>

          <div className="hall-table">
            <div className="th">
              <div>RANGO</div>
              <div>JUGADOR</div>
              <div>PUNTUACIÓN</div>
              <div>FECHA</div>
            </div>
            {rows.length === 0 && <div className="hall-empty pixel">SIN PUNTUACIONES AÚN · SÉ EL PRIMERO</div>}
            {rows.map((r, i) => (
              <div
                key={tab + r.name}
                className={"tr" + (TOP[i] ? " " + TOP[i] : "")}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="rk">#{pad(r.rank)}</div>
                <div className="pl">{r.name}</div>
                <div className="sc">{fmt(r.score)}</div>
                <div className="dt">{r.date}</div>
              </div>
            ))}
            {showYou && yourMark !== undefined && (
              <>
                <div className="tr you-label">
                  {yourMark ? `▸ TU MEJOR MARCA EN ${game.title}` : `▸ AÚN SIN MARCA EN ${game.title}`}
                </div>
                {yourMark && (
                  <div className="tr you" style={{ animationDelay: `${rows.length * 50 + 50}ms` }}>
                    <div className="rk text-yellow">#{pad(yourMark.rank)}</div>
                    <div className="pl text-yellow">{user.name}</div>
                    <div className="sc text-yellow [text-shadow:0_0_6px_rgba(245,255,0,0.5)]">
                      {fmt(yourMark.score)}
                    </div>
                    <div className="dt">{yourMark.date}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <div className="mt-8 text-center">
        <Link href="/biblioteca" className="btn lg">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
