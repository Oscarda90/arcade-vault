import Link from "next/link";
import { FeatureIcon, type FeatureIconKind } from "@/components/home/feature-icon";
import { FloatingSilhouettes } from "@/components/home/floating-silhouettes";
import { LiveActivity } from "@/components/home/live-activity";
import { MiniCard } from "@/components/home/mini-card";
import { Pricing } from "@/components/home/pricing";
import { Reveal } from "@/components/home/reveal";
import { GAMES, type GameColor } from "@/lib/games";

const FEATURES: { i: FeatureIconKind; t: string; d: string; c: GameColor }[] = [
  { i: "GAMEPAD", t: "JUEGOS CLÁSICOS", d: "Arkanoid, Tetris, Snake y muchos más. Los mejores arcades de todos los tiempos en un solo lugar.", c: "cyan" },
  { i: "FREE", t: "100% GRATIS", d: "Sin suscripciones, sin pagos ocultos. Todos los juegos disponibles de forma gratuita.", c: "yellow" },
  { i: "TROPHY", t: "LADDER BOARDS", d: "Compite con jugadores de todo el mundo. Escala el ranking y demuestra quién es el mejor.", c: "magenta" },
  { i: "ROCKET", t: "SIEMPRE CRECIENDO", d: "Agregamos nuevos juegos constantemente. Vuelve seguido, siempre habrá algo nuevo que jugar.", c: "green" },
];

const STATS = [
  { n: "12+", u: "JUEGOS", s: "Y CONTANDO" },
  { n: "MILES", u: "DE PARTIDAS", s: "JUGADAS CADA DÍA" },
  { n: "GLOBAL", u: "RANKING", s: "COMPITE CON EL MUNDO" },
];

function SectionHead({ n, title, color }: { n: string; title: string; color: GameColor }) {
  return (
    <div className="section-head">
      <div className={"kicker pixel neon-" + color}>{"// " + n}</div>
      <h2 className="section-title">{title}</h2>
      <div className="section-rule" />
    </div>
  );
}

export default function Home() {
  return (
    <div className="home fade-in">
      <Reveal />

      {/* HERO */}
      <section className="home-hero">
        <FloatingSilhouettes />
        <div className="home-hero-inner">
          <div className="hero-eyebrow pixel neon-yellow">
            ▸ INSERTA UNA MONEDA<span className="blink">_</span>
          </div>
          <h1 className="home-title">
            <span className="line-1">EL ARCADE</span>
            <span className="line-2">CLÁSICO ESTÁ</span>
            <span className="line-3">DE VUELTA</span>
          </h1>
          <p className="home-sub">
            Juega los mejores clásicos directamente en tu navegador.
            <br />
            Sin descargas. Sin costo. Solo diversión.
          </p>
          <div className="home-ctas">
            <Link href="/biblioteca" className="btn xl pulse">
              ▶  EXPLORAR JUEGOS
            </Link>
            <Link href="/auth?modo=registro" className="btn xl magenta">
              ✦  CREAR CUENTA
            </Link>
          </div>
          <div className="hero-scroll" aria-hidden="true">
            <span>DESLIZA</span>
            <span className="arrow">▼</span>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="home-section reveal">
        <SectionHead n="01" title="¿POR QUÉ ARCADE VAULT?" color="magenta" />
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div key={f.i} className={"feature-card " + f.c} style={{ transitionDelay: i * 80 + "ms" }}>
              <FeatureIcon kind={f.i} />
              <div className="ft-title pixel">{f.t}</div>
              <div className="ft-desc">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* GAMES PREVIEW */}
      <section className="home-section reveal">
        <SectionHead n="02" title="JUEGOS DISPONIBLES AHORA" color="cyan" />
        <div className="mini-rail">
          {GAMES.slice(0, 6).map((g) => (
            <MiniCard key={g.id} game={g} />
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/biblioteca" className="btn lg">
            VER TODOS LOS JUEGOS →
          </Link>
        </div>
      </section>

      {/* STATS */}
      <section className="home-stats reveal">
        <div className="stats-inner">
          {STATS.map((st, i) => (
            <div key={st.u} className="stat-block" style={{ transitionDelay: i * 90 + "ms" }}>
              <div className="stat-n neon-yellow">{st.n}</div>
              <div className="stat-u pixel">{st.u}</div>
              <div className="stat-s">{st.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ACTIVIDAD EN VIVO */}
      <section className="home-section reveal">
        <SectionHead n="03" title="ACTIVIDAD EN VIVO" color="yellow" />
        <LiveActivity />
      </section>

      {/* PRICING */}
      <section className="home-section reveal">
        <SectionHead n="04" title="PRECIOS" color="green" />
        <Pricing />
      </section>

      {/* FINAL CTA */}
      <section className="home-final reveal">
        <h2 className="final-title pixel">¿LISTO PARA JUGAR?</h2>
        <Link href="/biblioteca" className="btn xl pulse final-cta">
          INSERTAR MONEDA →
        </Link>
        <div className="final-tag">Gratis. Sin registro obligatorio. Empieza en segundos.</div>
      </section>
    </div>
  );
}
