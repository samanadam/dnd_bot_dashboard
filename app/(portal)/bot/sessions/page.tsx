import type { Metadata } from "next";
import { SessionHistory } from "@/components/bot/SessionHistory";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  await requireUser();
  return <SessionHistory />;
}
