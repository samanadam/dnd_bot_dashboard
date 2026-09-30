import type { Metadata } from "next";
import { AreasView } from "@/components/views/dm/AreasView";
import { selectedCampaign } from "@/lib/campaign/selected";
import { requireDm } from "@/lib/dm/access";
import { AreaRepo } from "@/lib/dm/areas";
import { getDatabase } from "@/lib/dm/database";

export const metadata: Metadata = { title: "Areas" };
export const dynamic = "force-dynamic";

export default async function AreasPage() {
  await requireDm();
  return <AreasView areas={new AreaRepo(getDatabase()).list(await selectedCampaign())} />;
}
