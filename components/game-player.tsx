"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, useTransition, type MouseEvent } from "react";
import { submitScore, type ScoreErrorCode } from "@/app/juegos/actions";
import { GameCanvas, type GameCanvasHandle } from "@/components/game-canvas";
import { getEngine } from "@/lib/engines/registry";
import type { EngineFactory, EngineState, EngineStats } from "@/lib/engines/types";
import type { Game } from "@/lib/games";
import { useSession } from "@/lib/session";

const fmt = (n: number) => n.toLocaleString("es-ES");

export function GamePlayer({ game }: { game: Game }) {
  const factory = getEngine(game.id);
  return factory ? <EnginePlayer game={game} factory={factory} /> : <SimulatedPlayer game={game} />;
}

// ── Piezas compartidas ────────────────────────────────────────────────────────

/** Nombre del jugador: el username de la sesión (fijo) o INVITADO. Se hidrata tras montar. */
function usePlayerName() {
  const { user } = useSession();
  return user?.name ?? "INVITADO";
}

function HudStats({ name, score, lives, level, powerUp = 0 }: {
  name: string;
  score: number;
  lives: number;
  level: number;
  powerUp?: number;
}) {
  return (
    <div className="flex flex-wrap gap-6">
      <div className="hud-stat">
        <div className="l">Jugador</div>
        <div className="v text-ink">{name}</div>
      </div>
      <div className="hud-stat">
        <div className="l">Puntuación</div>
        <div className="v">{fmt(score)}</div>
      </div>
      <div className="hud-stat lives">
        <div className="l">Vidas</div>
        <div className="v">{"♥ ".repeat(lives).trim() || "—"}</div>
      </div>
      <div className="hud-stat level">
        <div className="l">Nivel</div>
        <div className="v">{String(level).padStart(2, "0")}</div>
      </div>
      {powerUp > 0 && (
        <div className="hud-stat power">
          <div className="l">3X</div>
          <div className="v">{powerUp.toFixed(1)}s</div>
        </div>
      )}
    </div>
  );
}

function PausedOverlay() {
  return (
    <div className="crt-content z-[5] bg-black/60">
      <div>
        <div className="pixel neon-yellow text-[22px]">EN PAUSA</div>
        <div className="mono mt-2.5 text-[11px] tracking-[0.16em] text-ink-dim">
          PULSA REANUDAR PARA CONTINUAR
        </div>
      </div>
    </div>
  );
}

function CrtBottom({ game }: { game: Game }) {
  return (
    <div className="crt-bottom">
      <span className="led">SEÑAL OK</span>
      <span>{game.title} · CRT-83 · 60 HZ</span>
      <span>CARGA · 1MB</span>
    </div>
  );
}

const SCORE_ERRORS: Record<ScoreErrorCode, string> = {
  auth: "[ERR] Tu sesión expiró. Inicia sesión de nuevo.",
  invalid: "[ERR] Puntuación no válida.",
  not_playable: "[ERR] Puntuación no válida.",
  config: "[ERR] Servidor no configurado.",
  server: "[ERR] Fallo de conexión. Reintenta.",
};

/**
 * Bloque de guardado del modal. Su estado (guardado / error) vive aquí: el modal se
 * desmonta en JUGAR DE NUEVO, así que cada partida empieza sin error ni "guardada".
 */
function SaveScore({ game, score }: { game: Game; score: number }) {
  const { user, loading } = useSession();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ScoreErrorCode | null>(null);

  if (!game.playable) return <div className="score-note demo pixel">PARTIDA DEMO · NO PUNTÚA</div>;
  if (saved) return <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>;
  if (!loading && !user) {
    return (
      <Link href="/auth" className="score-note login pixel">
        INICIA SESIÓN PARA COMPETIR
      </Link>
    );
  }

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await submitScore(game.id, score);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  };

  return (
    <>
      <div className="input-row">
        <div className="player-name" aria-label="Jugador">
          {user?.name ?? "···"}
        </div>
        <button className="btn yellow" onClick={save} disabled={loading || pending}>
          {pending ? "▶ GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
        </button>
      </div>
      {error && (
        <div className="terminal-error modal-error" role="alert">
          {SCORE_ERRORS[error]}
        </div>
      )}
    </>
  );
}

function GameOverModal({ game, score, onRestart }: { game: Game; score: number; onRestart: () => void }) {
  return (
    <div className="modal-bd">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
        <h2 id="game-over-title">FIN DEL JUEGO</h2>
        <div className="final-label">PUNTUACIÓN FINAL</div>
        <div className="final">{fmt(score)}</div>
        <SaveScore game={game} score={score} />
        <div className="actions">
          <button className="btn" onClick={onRestart}>
            JUGAR DE NUEVO
          </button>
          <Link href="/biblioteca" className="btn magenta">
            VOLVER AL VAULT
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Partida real con motor en canvas ──────────────────────────────────────────

const INITIAL_STATS: EngineStats = { score: 0, lives: 3, level: 1, powerUp: 0 };

const FINE_POINTER = "(any-pointer: fine)";
function subscribePointer(onChange: () => void) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
/** En el servidor se asume teclado para no mostrar el aviso antes de hidratar. */
function useHasFinePointer() {
  return useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => true,
  );
}

function EnginePlayer({ game, factory }: { game: Game; factory: EngineFactory }) {
  const name = usePlayerName();
  const engine = useRef<GameCanvasHandle>(null);
  const [stats, setStats] = useState<EngineStats>(INITIAL_STATS);
  const [engineState, setEngineState] = useState<EngineState>("ready");
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const hasKeyboard = useHasFinePointer();

  const paused = engineState === "paused";

  const onStateChange = (s: EngineState) => {
    setEngineState(s);
    // Motor nuevo (montaje o vuelta a la página) o reinicio: sin modal pendiente.
    if (s === "ready" || s === "playing") setOver(false);
  };

  const onGameOver = (score: number) => {
    setFinalScore(score);
    setOver(true);
  };

  // blur(): evita que Espacio vuelva a activar el botón pulsado con el ratón.
  const togglePause = (e: MouseEvent<HTMLButtonElement>) => {
    if (paused) engine.current?.resume();
    else engine.current?.pause();
    e.currentTarget.blur();
  };

  const endRun = (e: MouseEvent<HTMLButtonElement>) => {
    engine.current?.end();
    e.currentTarget.blur();
  };

  const restart = () => {
    setOver(false);
    engine.current?.restart();
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <HudStats name={name} {...stats} />
        <div className="hud-actions">
          <button className="btn yellow" onClick={togglePause}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button className="btn magenta" onClick={endRun}>
            FIN
          </button>
          <Link href={`/juegos/${game.id}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <GameCanvas
            ref={engine}
            factory={factory}
            onStats={setStats}
            onStateChange={onStateChange}
            onGameOver={onGameOver}
          />
          {engineState === "ready" && (
            <div className="crt-content start-overlay z-[5]">
              <div>
                <div className="pixel neon-cyan start-title">PULSA ESPACIO PARA EMPEZAR</div>
                <table className="controls-table mono">
                  <caption className="sr-only">Controles</caption>
                  <tbody>
                    <tr>
                      <th scope="row"><kbd>←</kbd> <kbd>→</kbd></th>
                      <td>ROTAR</td>
                    </tr>
                    <tr>
                      <th scope="row"><kbd>↑</kbd></th>
                      <td>PROPULSAR</td>
                    </tr>
                    <tr>
                      <th scope="row"><kbd>ESPACIO</kbd></th>
                      <td>DISPARAR</td>
                    </tr>
                    <tr>
                      <th scope="row"><kbd>P</kbd> <kbd>ESC</kbd></th>
                      <td>PAUSA</td>
                    </tr>
                  </tbody>
                </table>
                {!hasKeyboard && <div className="pixel keyboard-warning">REQUIERE TECLADO</div>}
              </div>
            </div>
          )}
          {paused && <PausedOverlay />}
        </div>
        <CrtBottom game={game} />
      </div>

      {over && (
        <GameOverModal game={game} score={finalScore} onRestart={restart} />
      )}
    </div>
  );
}

// ── Partida simulada (sin lógica de juego real): el puntaje sube solo cada 220 ms ──

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

function SimulatedPlayer({ game }: { game: Game }) {
  const name = usePlayerName();
  const [run, dispatch] = useReducer(runReducer, INITIAL);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (over || paused) return;
    const t = setInterval(() => dispatch({ type: "tick", inc: Math.floor(10 + Math.random() * 90) }), 220);
    return () => clearInterval(t);
  }, [over, paused]);

  const restart = () => {
    dispatch({ type: "restart" });
    setPaused(false);
    setOver(false);
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <HudStats name={name} {...run} />
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
          {paused && <PausedOverlay />}
        </div>
        <CrtBottom game={game} />
      </div>

      {over && (
        <GameOverModal game={game} score={run.score} onRestart={restart} />
      )}
    </div>
  );
}
