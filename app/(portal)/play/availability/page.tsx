import type { Metadata } from "next";
import { AvailabilityView } from "@/components/views/play/AvailabilityView";
import { requireAnyAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  await requireAnyAccess(["play"]);
  return <AvailabilityView />;
}
