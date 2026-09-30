import type { Metadata } from "next";
import { DemoBestiary } from "@/components/demo/dm/DemoBestiary";

export const metadata: Metadata = { title: "Bestiary" };

export default async function DemoBestiaryPage(props: PageProps<"/demo/dm/bestiary">) {
  const search = await props.searchParams;
  return <DemoBestiary initialSource={search.source === "custom" ? "custom" : "all"} />;
}
