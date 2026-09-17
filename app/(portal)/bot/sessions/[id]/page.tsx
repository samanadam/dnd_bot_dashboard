import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptView } from "@/components/bot/TranscriptView";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Transcript" };

// Dated ids (2026-09-09-2130-a1b2c3d4) and the older UUIDs; same rule as the proxy.
const SESSION_ID = /^[a-z0-9-]{8,64}$/;

export default async function TranscriptPage(props: PageProps<"/bot/sessions/[id]">) {
  await requireUser();
  const { id } = await props.params;
  if (!SESSION_ID.test(id)) notFound();
  return <TranscriptView sessionId={id} />;
}
