import { notFound } from "next/navigation";
import { GamePlayer } from "@/components/game-player";
import { GAMES, getGame } from "@/lib/games";

// Fuera de la validación de navegación instantánea: leer params fuera de <Suspense>
// mantiene el 404 real para ids inexistentes (con Suspense respondería 200).
export const instant = false;

export function generateStaticParams() {
  return GAMES.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/juegos/[id]/jugar">) {
  const { id } = await params;
  const game = getGame(id);
  return { title: game ? `Jugando ${game.title} · Arcade Vault` : "Juego no encontrado · Arcade Vault" };
}

export default async function GamePlayerPage({ params }: PageProps<"/juegos/[id]/jugar">) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) notFound();
  return <GamePlayer game={game} />;
}
