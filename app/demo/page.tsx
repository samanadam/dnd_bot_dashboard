import type { Metadata } from "next";
import { DemoHub } from "@/components/demo/DemoShell";

export const metadata: Metadata = { title: "Home" };

export default function DemoHubPage() {
  return <DemoHub />;
}
