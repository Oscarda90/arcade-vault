import type { ScoreRow } from "@/lib/games";

const TOP = ["top1", "top2", "top3"];

export function Leaderboard({
  rows,
  playable,
  title = "MEJORES PUNTUACIONES",
}: {
  rows: ScoreRow[];
  /** false → juego en demo, sin ranking */
  playable: boolean;
  title?: string;
}) {
  return (
    <div className="leaderboard">
      <h3>{title}</h3>
      {!playable ? (
        <div className="lb-empty demo pixel">MODO DEMO · SIN RANKING</div>
      ) : rows.length === 0 ? (
        <div className="lb-empty pixel">SIN PUNTUACIONES AÚN · SÉ EL PRIMERO</div>
      ) : (
        rows.map((r, i) => (
          <div key={r.name} className={"lb-row" + (TOP[i] ? " " + TOP[i] : "")}>
            <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
            <div className="pl">
              {r.name}
              <div className="text-[10px] tracking-[0.1em] text-ink-faint">{r.date}</div>
            </div>
            <div className="sc">{r.score.toLocaleString("es-ES")}</div>
          </div>
        ))
      )}
    </div>
  );
}
