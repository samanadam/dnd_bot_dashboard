import type { Metadata } from "next";
import { DemoNpcs } from "@/components/demo/dm/DemoLists";

export const metadata: Metadata = { title: "NPCs" };

export default function DemoNpcsPage() {
  return <DemoNpcs />;
}
