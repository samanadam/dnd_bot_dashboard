import type { Metadata } from "next";
import { DemoCombat } from "@/components/demo/dm/DemoLists";

export const metadata: Metadata = { title: "Combat" };

export default function DemoCombatPage() {
  return <DemoCombat />;
}
