import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoArea } from "@/components/demo/dm/DemoArea";
import { AREA_ID } from "@/lib/dm/areas";

export const metadata: Metadata = { title: "Area" };

export default async function DemoAreaPage(props: PageProps<"/demo/dm/areas/[id]">) {
  const { id } = await props.params;
  if (!AREA_ID.test(id)) notFound();
  return <DemoArea id={id} />;
}
