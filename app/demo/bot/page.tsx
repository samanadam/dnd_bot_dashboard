import type { Metadata } from "next";
import { Overview } from "@/components/bot/Overview";

export const metadata: Metadata = { title: "D&D Recorder" };

export default function DemoBotPage() {
  return <Overview />;
}
