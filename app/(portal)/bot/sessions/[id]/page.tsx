import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptView } from "@/components/bot/TranscriptView";
import { isDm } from "@/lib/dm/isDm";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Transcript" };

// Dated ids (2026-09-09-2130-a1b2c3d4) and the older UUIDs; same rule as the proxy.
const SESSION_ID = /^[a-z0-9-]{8,64}$/;

export default async function TranscriptPage(props: PageProps<"/bot/sessions/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!SESSION_ID.test(id)) notFound();
  const { seq } = await props.searchParams;
  const focus = typeof seq === "string" && /^\d{1,6}$/.test(seq) ? Number(seq) : null;
  // Only decides whether the filing control renders; the proxy enforces it.
  return <TranscriptView sessionId={id} focusSeq={focus} canManage={isDm(user.id, env().DM_USER_IDS)} />;
}
