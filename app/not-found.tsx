import Link from "next/link";

export default function NotFound() {
  return (
    <section className="fade-in flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <div className="pixel text-[10px] tracking-[0.2em] text-ink-faint">ERROR 404 · SEÑAL PERDIDA</div>
      <h1 className="pixel flicker neon-magenta m-0 text-[clamp(28px,6vw,56px)]">GAME OVER</h1>
      <p className="pixel neon-cyan m-0 text-xs">JUEGO NO ENCONTRADO</p>
      <p className="m-0 max-w-md text-ink-dim">
        Este cartucho no está en el vault. Puede que la dirección esté mal escrita o que el juego ya no exista.
      </p>
      <Link href="/" className="btn lg mt-2">
        VOLVER AL VAULT
      </Link>
      <div className="pixel text-[9px] tracking-[0.16em] text-yellow">
        INSERTA UNA MONEDA PARA CONTINUAR <span className="animate-[blink_1.2s_steps(1,end)_infinite]">_</span>
      </div>
    </section>
  );
}
