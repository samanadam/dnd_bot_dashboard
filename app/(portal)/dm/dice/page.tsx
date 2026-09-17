import type { Metadata } from "next";
import { DicePage } from "@/components/dm/DicePage";
import { DmHeader } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";

export const metadata: Metadata = { title: "Dice" };

export default async function DiceRoute() {
  await requireDm();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Dice"
        description="Rolled in your browser with cryptographic randomness. Send a result to Discord when the table should see it."
      />
      <DicePage />
    </div>
  );
}
