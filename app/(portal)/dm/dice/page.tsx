import type { Metadata } from "next";
import { DiceView } from "@/components/views/dm/DiceView";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Dice" };

export default async function DiceRoute() {
  await requireDm();
  return <DiceView />;
}
