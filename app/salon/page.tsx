import type { Metadata } from "next";
import { HallOfFame } from "@/components/hall-of-fame";
import { getAllLeaderboards, getGames } from "@/lib/data/games";

export const metadata: Metadata = { title: "Salón de la Fama · Arcade Vault" };

export default async function SalonPage() {
  const [games, boards] = await Promise.all([getGames(), getAllLeaderboards(12)]);
  return <HallOfFame games={games} boards={boards} />;
}
