import { DicePage } from "@/components/dm/DicePage";
import { DmHeader } from "@/components/dm/DmHeader";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function DiceView() {
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
