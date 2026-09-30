import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SrdMonsterView } from "@/components/views/dm/SrdMonsterView";
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
  return <SrdMonsterView edition={edition} slug={slug} block={block} />;
}
