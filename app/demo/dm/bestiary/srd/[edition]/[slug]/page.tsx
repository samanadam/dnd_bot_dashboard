import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SrdMonsterView } from "@/components/views/dm/SrdMonsterView";
import { demoSrdBlock } from "@/lib/demo/srd";

type Props = PageProps<"/demo/dm/bestiary/srd/[edition]/[slug]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { edition, slug } = await props.params;
  return { title: demoSrdBlock(edition, slug)?.name ?? "Monster" };
}

export default async function DemoSrdMonsterPage(props: Props) {
  const { edition, slug } = await props.params;
  const block = demoSrdBlock(edition, slug);
  if (!block || (edition !== "2014" && edition !== "2024")) notFound();
  return <SrdMonsterView edition={edition} slug={slug} block={block} />;
}
