import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptView } from "@/components/bot/TranscriptView";
import { can } from "@/lib/access/permissions";
import { requireAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Transcript" };

// Dated ids (2026-09-09-2130-a1b2c3d4) and the older UUIDs; same rule as the proxy.
const SESSION_ID = /^[a-z0-9-]{8,64}$/;

export default async function TranscriptPage(props: PageProps<"/bot/sessions/[id]">) {
  const access = await requireAccess("bot.sessions");
  const { id } = await props.params;
  if (!SESSION_ID.test(id)) notFound();
  const { seq } = await props.searchParams;
  const focus = typeof seq === "string" && /^\d{1,6}$/.test(seq) ? Number(seq) : null;
  // Only decides whether the filing control renders; the proxy enforces it.
  return <TranscriptView sessionId={id} focusSeq={focus} canManage={can(access, "bot.manage")} />;
}
