import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { BestiaryBrowser } from "@/components/dm/BestiaryBrowser";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { CreatureRepo } from "@/lib/dm/creatures";
import { getDatabase } from "@/lib/dm/database";
import { listSrd, summarise } from "@/lib/dm/srd";

export const metadata: Metadata = { title: "Bestiary" };
export const dynamic = "force-dynamic";

export default async function BestiaryPage(props: PageProps<"/dm/bestiary">) {
  await requireDm();
  const search = await props.searchParams;
  const custom = new CreatureRepo(getDatabase())
    .list("monster")
    .map((c) => summarise(c.id, c.id, "custom", c.kind, c.statBlock, c.tags));
  const initialSource = search.source === "custom" ? "custom" : "all";

  return (
    <div className="space-y-6">
      <DmHeader
        eyebrow="DM Screen"
        title="Bestiary"
        description="The free SRD monsters from both rule sets, and the ones you add from your own books."
        action={
          <LinkButton href="/dm/creatures/new" icon={Plus} variant="primary">
            New monster
          </LinkButton>
        }
      />
      <BestiaryBrowser monsters={[...custom, ...listSrd()]} initialSource={initialSource} />
      <p className="text-xs text-faint">
        SRD 5.1 and 5.2 content by Wizards of the Coast LLC, licensed under CC-BY-4.0.
      </p>
    </div>
  );
}
