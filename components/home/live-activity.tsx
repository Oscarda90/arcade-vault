import Link from "next/link";
import type { GameColor } from "@/lib/games";

// Mocks estáticos copiados del template; datos reales quedan para otro spec.
const TICKER: { p: string; g: string; s: number; t: string; c: GameColor }[] = [
  { p: "NEONFOX", g: "Caída", s: 184220, t: "hace 2 min", c: "magenta" },
  { p: "PX_KAI", g: "Glotón", s: 96400, t: "hace 5 min", c: "yellow" },
  { p: "Z3R0COOL", g: "Invasores", s: 54190, t: "hace 8 min", c: "green" },
  { p: "VAULT_07", g: "Rocas", s: 41200, t: "hace 12 min", c: "cyan" },
  { p: "GLITCHA", g: "Bloque Buster", s: 28450, t: "hace 18 min", c: "cyan" },
  { p: "ARKADYA", g: "Serpentina", s: 7820, t: "hace 24 min", c: "green" },
  { p: "CYBER_LU", g: "Ranaria", s: 18900, t: "hace 31 min", c: "yellow" },
];

const TOP: { r: number; p: string; s: number }[] = [
  { r: 1, p: "NEONFOX", s: 312840 },
  { r: 2, p: "PX_KAI", s: 248110 },
  { r: 3, p: "M00NRYU", s: 196720 },
  { r: 4, p: "VAULT_07", s: 154300 },
  { r: 5, p: "GLITCHA", s: 138900 },
];

const TOP_CLASS = [" top1", " top2", " top3"];

export function LiveActivity() {
  return (
    <div className="activity-grid">
      <div className="activity-card">
        <div className="ac-head">
          <div className="ac-title pixel">▸ ÚLTIMAS PUNTUACIONES</div>
        </div>
        <div className="ticker">
          {TICKER.map((r, i) => (
            <div key={i} className="tick-row" style={{ animationDelay: i * 60 + "ms" }}>
              <span className={"tk-p neon-" + r.c}>{r.p}</span>
              <span className="tk-mid">▸ {r.g}</span>
              <span className="tk-s">+{r.s.toLocaleString("es-ES")}</span>
              <span className="tk-t">{r.t}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="activity-card">
        <div className="ac-head">
          <div className="ac-title pixel neon-magenta">▸ TOP JUGADORES · HOY</div>
          <Link href="/salon" className="lb-link">
            VER SALÓN →
          </Link>
        </div>
        <div className="top-list">
          {TOP.map((r, i) => (
            <div key={i} className={"top-row" + (TOP_CLASS[i] ?? "")}>
              <span className="tp-rk">#{String(r.r).padStart(2, "0")}</span>
              <span className="tp-bar">
                <span className="tp-fill" style={{ width: 100 - i * 16 + "%" }} />
              </span>
              <span className="tp-p">{r.p}</span>
              <span className="tp-s">{r.s.toLocaleString("es-ES")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
