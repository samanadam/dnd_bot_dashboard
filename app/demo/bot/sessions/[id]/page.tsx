import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptView } from "@/components/bot/TranscriptView";

export const metadata: Metadata = { title: "Transcript" };

// Same rule as the portal page and the proxy.
const SESSION_ID = /^[a-z0-9-]{8,64}$/;

export default async function DemoTranscriptPage(props: PageProps<"/demo/bot/sessions/[id]">) {
  const { id } = await props.params;
  if (!SESSION_ID.test(id)) notFound();
  const { seq } = await props.searchParams;
  const focus = typeof seq === "string" && /^\d{1,6}$/.test(seq) ? Number(seq) : null;
  return <TranscriptView sessionId={id} focusSeq={focus} canManage />;
}
