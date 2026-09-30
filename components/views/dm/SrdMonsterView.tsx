import { Copy } from "lucide-react";
import { RollableStatBlock } from "@/components/dm/DiceProvider";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import type { Edition } from "@/lib/dm/monsterSummary";
import type { StatBlock } from "@/lib/dm/statblock";

// The DM Screen pages without their data source. The portal's pages read the
// database on the server and pass the result in; the demo's pages pass in what
// the browser-side demo store holds. Either way the same UI renders.

export function SrdMonsterView({ edition, slug, block }: { edition: Edition; slug: string; block: StatBlock }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DmHeader
        back={{ href: "/dm/bestiary", label: "Bestiary" }}
        eyebrow={`SRD ${edition === "2024" ? "5.2 · 2024 rules" : "5.1 · 2014 rules"}`}
        title={block.name}
        hideTitle
        action={
          <LinkButton href={`/dm/creatures/new?copy=${edition}/${slug}`} icon={Copy}>
            Copy to my monsters
          </LinkButton>
        }
      />
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-8">
        <RollableStatBlock block={block} />
      </div>
      <p className="text-xs text-faint">From the System Reference Document by Wizards of the Coast LLC, CC-BY-4.0.</p>
    </div>
  );
}
