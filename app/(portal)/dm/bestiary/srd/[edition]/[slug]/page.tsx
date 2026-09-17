import { Copy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RollableStatBlock } from "@/components/dm/DiceProvider";
import { DmHeader, LinkButton } from "@/components/dm/DmHeader";
import { requireDm } from "@/lib/dm/access";
import { getSrd, isEdition } from "@/lib/dm/srd";

type Props = PageProps<"/dm/bestiary/srd/[edition]/[slug]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { edition, slug } = await props.params;
  const block = isEdition(edition) ? getSrd(edition, slug) : null;
  return { title: block?.name ?? "Monster" };
}

export default async function SrdMonsterPage(props: Props) {
  await requireDm();
  const { edition, slug } = await props.params;
  if (!isEdition(edition)) notFound();
  const block = getSrd(edition, slug);
  if (!block) notFound();

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
