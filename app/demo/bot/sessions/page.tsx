import type { Metadata } from "next";
import { SessionHistory } from "@/components/bot/SessionHistory";

export const metadata: Metadata = { title: "Sessions" };

export default function DemoSessionsPage() {
  return <SessionHistory canManage />;
}
