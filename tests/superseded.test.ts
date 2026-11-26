import { describe, expect, it } from "vitest";
import { creatureSearch } from "@/lib/dm/creatureSearch";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import type { MonsterSummary } from "@/lib/dm/monsterSummary";
import { sourceLabel, withoutSuperseded } from "@/lib/dm/superseded";
import { getSrd } from "@/lib/dm/srd";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";
import { ownerAccess } from "./helpers/access";

const DM = "111111111111111111";
const srd = (name: string, edition: "2014" | "2024", slug: string): MonsterSummary => ({ id: `srd-${edition}:${slug}`, slug, edition, kind: "monster", name, cr: "1", type: "x", size: "Small", hp: 1, ac: 1 });

describe("withoutSuperseded", () => {
  it("drops only the listed edition/slug pairs", () => {
    const list = [srd("Goblin", "2024", "goblin"), srd("Goblin", "2014", "goblin"), srd("Orc", "2024", "orc")];
    expect(withoutSuperseded(list, new Set(["2024/goblin"])).map((m) => m.id)).toEqual(["srd-2014:goblin", "srd-2024:orc"]);
  });
});

describe("sourceLabel", () => {
  it("names known books and echoes unknown ones", () => {
    expect(sourceLabel("ddb:mm-2024")).toBe("Monster Manual (2024)");
    expect(sourceLabel("ddb:xyz-2014")).toBe("ddb:xyz-2014");
  });
});

describe("creature search with an imported book", () => {
  const search = async (hidden: boolean) => {
    const repo = new CreatureRepo(openDatabase(":memory:"));
    repo.upsertImported({ kind: "monster", statBlock: { ...goblin, name: "Goblin" }, notes: "", tags: [] }, { source: "ddb:mm-2024", sourceKey: "1", supersedes: hidden ? "2024/goblin" : null });
    const deps = {
      getAccess: ownerAccess(DM, [DM]),
      limiter: new RateLimiter(),
      repo: () => repo,
      srdMonsters: () => [srd("Goblin", "2024", "goblin")],
    };
    const response = await creatureSearch(deps).GET(
      new Request("https://portal.example/api/dm/creatures/search?q=goblin", { headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin" } }),
    );
    return ((await response.json()) as { results: Array<{ ref: { source: string } }> }).results.map((r) => r.ref.source);
  };

  it("lists the imported monster and not the SRD twin it replaces", async () => {
    expect(await search(true)).toEqual(["custom"]);
  });

  it("lists both when nothing is superseded", async () => {
    expect((await search(false)).sort()).toEqual(["custom", "srd"]);
  });
});

describe("superseded SRD entries stay resolvable", () => {
  it("still returns the bundled stat block for a replaced slug", () => {
    expect(getSrd("2024", "aboleth")?.name).toBe("Aboleth");
  });
});
