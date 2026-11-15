"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import type { Game } from "@/lib/games";
import { useSession } from "@/lib/session";

// Partida simulada (sin lógica de juego real): el puntaje sube solo cada 220 ms.
interface Run {
  score: number;
  lives: number;
  level: number;
}

const INITIAL: Run = { score: 0, lives: 3, level: 1 };

function runReducer(state: Run, action: { type: "tick"; inc: number } | { type: "restart" }): Run {
  if (action.type === "restart") return INITIAL;
  const score = state.score + action.inc;
  // Igual que el template: sube de nivel cuando el puntaje cae en los primeros 100 de cada bloque de 2500.
  const level = score % 2500 < 100 ? state.level + 1 : state.level;
  return { ...state, score, level };
}

export function GamePlayer({ game }: { game: Game }) {
  const { user, saveScore } = useSession();
  const [run, dispatch] = useReducer(runReducer, INITIAL);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [saved, setSaved] = useState(false);
  // null = aún no editado: se muestra el nombre de la sesión (que se hidrata tras montar).
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const name = nameEdit ?? user?.name ?? "INVITADO";

  useEffect(() => {
    if (over || paused) return;
    const t = setInterval(() => dispatch({ type: "tick", inc: Math.floor(10 + Math.random() * 90) }), 220);
    return () => clearInterval(t);
  }, [over, paused]);

  const restart = () => {
    dispatch({ type: "restart" });
    setPaused(false);
    setOver(false);
    setSaved(false);
  };

  const fmt = (n: number) => n.toLocaleString("es-ES");

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div className="flex flex-wrap gap-6">
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v text-ink">{name}</div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{fmt(run.score)}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(run.lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(run.level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button className="btn magenta" onClick={() => setOver(true)}>
            FIN
          </button>
          <Link href={`/juegos/${game.id}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <div className="game-arena">
            <div className="grid-floor" />
            <div className="enemy e1" />
            <div className="enemy e2" />
            <div className="enemy e3" />
            <div className="player-ship" />
          </div>
          {paused && (
            <div className="crt-content z-[5] bg-black/60">
              <div>
                <div className="pixel neon-yellow text-[22px]">EN PAUSA</div>
                <div className="mono mt-2.5 text-[11px] tracking-[0.16em] text-ink-dim">
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
            <h2 id="game-over-title">FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{fmt(run.score)}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) => setNameEdit(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="TUS INICIALES"
                  aria-label="Nombre para la puntuación"
                />
                <button
                  className="btn yellow"
                  onClick={() => {
                    saveScore({ game: game.id, score: run.score, name });
                    setSaved(true);
                  }}
                >
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link href="/biblioteca" className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
