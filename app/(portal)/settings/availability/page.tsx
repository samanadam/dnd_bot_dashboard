import type { Metadata } from "next";
import { AvailabilitySettingsView } from "@/components/views/AvailabilitySettingsView";
import { requireOwner } from "@/lib/access/server";

export const metadata: Metadata = { title: "Availability settings" };
export const dynamic = "force-dynamic";

export default async function AvailabilitySettingsPage() {
  await requireOwner();
  return <AvailabilitySettingsView />;
}
