import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import type { CreatureRepo } from "./creatures";
import type { CreatureRef } from "./encounter";
import { guardDm, type DmGuardDeps } from "./guard";
import { json } from "./http";
import type { MonsterSummary } from "./srd";

// GET /api/dm/creatures/search: SRD monsters and the DM's own creatures together,
// for the picker that links a pointer reward to an NPC. Returns only a reference
// and a label, never a stat block.

export type CreatureSearchDeps = DmGuardDeps & { repo: () => CreatureRepo; srdMonsters: () => MonsterSummary[] };

export type CreatureSearchResult = { ref: CreatureRef; name: string; kind: "monster" | "npc"; detail: string };

const MAX_RESULTS = 30;
const fold = (text: string) => text.toLocaleLowerCase("en");

export function creatureSearch(deps: CreatureSearchDeps) {
  return {
    /** ?q= text (needed), ?campaign= narrows the DM's NPCs. */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const params = new URL(request.url).searchParams;
      const campaign = parseSelectionStrict(params.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const q = fold((params.get("q") ?? "").trim().slice(0, 80));

      const repo = deps.repo();
      const mine: CreatureSearchResult[] = [
        ...repo.list("npc", campaign.selection),
        // Custom monsters are shared between campaigns, like in the bestiary.
        ...repo.list("monster"),
      ].map((creature) => ({
        ref: { source: "custom", id: creature.id },
        name: creature.statBlock.name,
        kind: creature.kind,
        detail: creature.kind === "npc" ? "Your NPC" : "Your monster",
      }));
      const srd: CreatureSearchResult[] = deps.srdMonsters().map((monster) => ({
        ref: { source: "srd", edition: monster.edition as "2014" | "2024", slug: monster.slug },
        name: monster.name,
        kind: "monster",
        detail: `SRD ${monster.edition} · CR ${monster.cr}`,
      }));
      const results = [...mine, ...srd].filter((entry) => !q || fold(entry.name).includes(q)).slice(0, MAX_RESULTS);
      return json({ results });
    },
  };
}
