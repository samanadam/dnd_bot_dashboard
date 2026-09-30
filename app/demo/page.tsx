import type { Metadata } from "next";
import { HubView } from "@/components/views/HubView";
import { DEMO_USER } from "@/lib/demo/fixtures";
import { tools } from "@/lib/tools/registry";

export const metadata: Metadata = { title: "Home" };

export default function DemoHubPage() {
  return <HubView name={DEMO_USER.name} tools={tools} />;
}
