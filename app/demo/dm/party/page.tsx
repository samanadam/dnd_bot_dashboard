import type { Metadata } from "next";
import { PartyView } from "@/components/views/dm/PartyView";

export const metadata: Metadata = { title: "Party" };

export default function DemoPartyPage() {
  return <PartyView />;
}
