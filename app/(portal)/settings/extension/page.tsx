import type { Metadata } from "next";
import { ExtensionSettings } from "@/components/settings/ExtensionSettings";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "D&D Beyond sync" };
export const dynamic = "force-dynamic";

export default async function ExtensionPage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="D&D Beyond sync" description="Pair the browser extension so your D&D Beyond character shows up here, live." />
      <ExtensionSettings />
    </div>
  );
}
