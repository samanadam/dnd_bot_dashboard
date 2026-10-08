import type { Metadata } from "next";
import { AccessView } from "@/components/views/AccessView";
import { requireOwner } from "@/lib/access/server";

export const metadata: Metadata = { title: "Access" };
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  await requireOwner();
  return <AccessView />;
}
