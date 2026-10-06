import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SheetLoader } from "@/components/views/play/PlayCampaignView";
import { requireDm } from "@/lib/dm/access";
import { getAccess } from "@/lib/access/server";
import { openSheet } from "@/lib/play/pages";

export const metadata: Metadata = { title: "Character" };
export const dynamic = "force-dynamic";

export default async function PartySheetPage(props: PageProps<"/dm/party/[id]">) {
  await requireDm();
  const access = await getAccess();
  if (!access) notFound();
  const { id } = await props.params;
  const view = openSheet(access, null, id);
  if (!view.manager) notFound();
  return <SheetLoader id={id} initial={view} backHref="/dm/party" />;
}
