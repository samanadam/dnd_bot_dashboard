// Which portal campaign a synced D&D Beyond character belongs in. Pure rules; the
// sync route supplies the facts (what the player chose before, what they play in).

export type CampaignRef = { id: string; name: string };
export type DdbCampaign = { id: string; name: string };

/** A character in no D&D Beyond campaign is keyed by this id, so the player picks a portal campaign for it once. */
export const NO_DDB_CAMPAIGN = "none";

/** The D&D Beyond campaign a raw character says it is in, or null. */
export function campaignOf(raw: unknown): DdbCampaign | null {
  const campaign = (raw as { data?: { campaign?: unknown } } | null)?.data?.campaign as { id?: unknown; name?: unknown } | null | undefined;
  if (!campaign || (typeof campaign.id !== "number" && typeof campaign.id !== "string") || typeof campaign.name !== "string") return null;
  const name = campaign.name.trim();
  return name ? { id: String(campaign.id), name } : null;
}

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export type Resolution =
  | { kind: "ok"; campaignId: string; remember: boolean }
  | { kind: "needs"; candidates: CampaignRef[] }
  | { kind: "none" };

/**
 * Order: a choice made before (if the player still plays there), a portal campaign with the
 * same name as the D&D Beyond one (only when exactly one does), the only campaign the player
 * plays in. Otherwise the player must choose. `remember` says the answer is worth storing.
 */
export function resolveCampaign(input: { ddb: DdbCampaign | null; mapped: string | null; candidates: CampaignRef[] }): Resolution {
  const { ddb, mapped, candidates } = input;
  if (candidates.length === 0) return { kind: "none" };
  if (mapped && candidates.some((c) => c.id === mapped)) return { kind: "ok", campaignId: mapped, remember: false };
  if (ddb) {
    const same = candidates.filter((c) => norm(c.name) === norm(ddb.name));
    if (same.length === 1) return { kind: "ok", campaignId: same[0].id, remember: true };
  }
  if (candidates.length === 1) return { kind: "ok", campaignId: candidates[0].id, remember: true };
  return { kind: "needs", candidates };
}
