import type { Metadata } from "next";
import { AccessView } from "@/components/views/AccessView";

export const metadata: Metadata = { title: "Access" };

export default function DemoAccessPage() {
  return <AccessView />;
}
