"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { EngineCallbacks, EngineFactory, GameEngine } from "@/lib/engines/types";

export interface GameCanvasHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  end(): void;
}

interface GameCanvasProps extends EngineCallbacks {
  factory: EngineFactory;
  ref?: Ref<GameCanvasHandle>;
}

/**
 * Monta un motor de juego sobre un <canvas>. El motor se crea al montar y se
 * destruye al desmontar (o al ocultarse por Activity); sobrevive a re-renders
 * porque los callbacks se leen desde una ref.
 */
export function GameCanvas({ factory, onStats, onStateChange, onGameOver, ref }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const callbacksRef = useRef<EngineCallbacks>({ onStats, onStateChange, onGameOver });

  // Mantiene los callbacks al día sin recrear el motor.
  useEffect(() => {
    callbacksRef.current = { onStats, onStateChange, onGameOver };
  }, [onStats, onStateChange, onGameOver]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = factory(canvas, {
      onStats: (s) => callbacksRef.current.onStats(s),
      onStateChange: (s) => callbacksRef.current.onStateChange(s),
      onGameOver: (score) => callbacksRef.current.onGameOver(score),
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [factory]);

  useImperativeHandle(
    ref,
    () => ({
      pause: () => engineRef.current?.pause(),
      resume: () => engineRef.current?.resume(),
      restart: () => engineRef.current?.restart(),
      end: () => engineRef.current?.end(),
    }),
    [],
  );

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Pantalla de juego" />;
}
