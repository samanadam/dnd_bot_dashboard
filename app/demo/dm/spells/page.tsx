import type { Metadata } from "next";
import { SpellsView } from "@/components/views/dm/SpellsView";

export const metadata: Metadata = { title: "Spells" };

export default function DemoSpellsPage() {
  return <SpellsView />;
}
