import type { Metadata } from "next";
import { DiceView } from "@/components/views/dm/DiceView";

export const metadata: Metadata = { title: "Dice" };

export default function DemoDicePage() {
  return <DiceView />;
}
