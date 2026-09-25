import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/dm/db";

// Drives the real route files under app/api/dm with the production dependency
// wiring (dmDeps, the bundled SRD data, the real lookups). Only the session, the
// environment, the audit log and the database file are replaced.

const DM = "111111111111111111";
const state = vi.hoisted(() => ({ user: null as string | null, db: null as unknown, audit: [] as unknown[] }));

vi.mock("@/auth", () => ({ auth: async () => (state.user ? { user: { id: state.user } } : null) }));
vi.mock("@/lib/env", () => ({ env: () => ({ DM_USER_IDS: ["111111111111111111"] }) }));
vi.mock("@/lib/audit", () => ({ audit: (entry: unknown) => state.audit.push(entry) }));
vi.mock("@/lib/dm/database", () => ({ getDatabase: () => state.db }));

beforeEach(() => {
  state.user = DM;
  state.db = openDatabase(":memory:");
  state.audit = [];
});

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

function call(method: string, path: string, body?: unknown) {
  return new Request(`https://portal.example/api/dm/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

describe("areas through the real route files", () => {
  it("runs the whole flow against the bundled SRD data", async () => {
    const areas = await import("@/app/api/dm/areas/route");
    const area = await import("@/app/api/dm/areas/[id]/route");
    const links = await import("@/app/api/dm/areas/[id]/encounters/route");
    const rewards = await import("@/app/api/dm/areas/[id]/rewards/route");
    const status = await import("@/app/api/dm/areas/[id]/rewards/[rewardId]/route");
    const encounters = await import("@/app/api/dm/encounters/route");
    const items = await import("@/app/api/dm/items/search/route");
    const srdItem = await import("@/app/api/dm/items/srd/[edition]/[slug]/route");
    const creatures = await import("@/app/api/dm/creatures/search/route");

    // Real SRD items come back from the search and can be read one by one.
    const search = await (await items.GET(call("GET", "items/search?q=longsword&source=2014"))).json();
    expect(search.total).toBeGreaterThan(0);
    const found = search.results[0];
    expect(found.ref).toMatchObject({ source: "srd", edition: "2014" });
    const block = await srdItem.GET(call("GET", `items/srd/2014/${found.ref.slug}`), ctx({ edition: "2014", slug: found.ref.slug }));
    expect((await block.json()).name).toBe(found.name);

    // Real SRD monsters can be found to link to a pointer.
    const monsters = await (await creatures.GET(call("GET", "creatures/search?q=goblin"))).json();
    expect(monsters.results.length).toBeGreaterThan(0);
    const goblin = monsters.results[0];

    // A prepared encounter to fight there.
    const prepared = await (await encounters.POST(call("POST", "encounters", { name: "Ambush", campaignId: null, kind: "prepared" }))).json();

    const created = await (await areas.POST(call("POST", "areas", { name: "Cragmaw Hideout", summary: "Damp", notes: "" }))).json();
    const id = created.area.id;
    const linked = await (await links.PUT(call("PUT", `areas/${id}/encounters`, { version: 1, encounterIds: [prepared.id] }), ctx({ id }))).json();
    expect(linked.battles[0].name).toBe("Ambush");

    const saved = await rewards.PUT(
      call("PUT", `areas/${id}/rewards`, {
        version: linked.area.version,
        rewards: [
          { kind: "item", encounterId: prepared.id, status: "planned", itemRef: found.ref, quantity: 1, note: "" },
          { kind: "pointer", encounterId: null, status: "pending", title: "Ally", condition: "Spare him", outcome: "He returns", npcRef: goblin.ref },
        ],
      }),
      ctx({ id }),
    );
    expect(saved.status).toBe(200);
    const body = await saved.json();
    // The names come from the real SRD data.
    expect(body.rewards[0].resolved.name).toBe(found.name);
    expect(body.rewards[1].resolved.name).toBe(goblin.name);

    const ticked = await status.PATCH(call("PATCH", `areas/${id}/rewards/${body.rewards[0].id}`, { status: "given" }), ctx({ id, rewardId: body.rewards[0].id }));
    expect(ticked.status).toBe(200);
    expect((await ticked.json()).rewards[0].status).toBe("given");

    const list = await (await areas.GET(call("GET", "areas"))).json();
    expect(list[0]).toMatchObject({ battles: 1, rewardsTotal: 2, rewardsDone: 1 });

    expect((await area.DELETE(call("DELETE", `areas/${id}`), ctx({ id }))).status).toBe(204);
    // Writes were audited, without what was written.
    expect(state.audit.length).toBeGreaterThan(3);
    expect(JSON.stringify(state.audit)).not.toContain("Cragmaw");
    expect(JSON.stringify(state.audit)).not.toContain("Spare him");
  });

  it("gives everyone but the DM the unknown-URL answer on every new route", async () => {
    const files = await Promise.all([
      import("@/app/api/dm/areas/route"),
      import("@/app/api/dm/items/route"),
      import("@/app/api/dm/items/search/route"),
      import("@/app/api/dm/creatures/search/route"),
    ]);
    state.user = "222222222222222222";
    for (const file of files) {
      const response = await file.GET(call("GET", "x"));
      expect(response.status).toBe(404);
    }
    state.user = null;
    expect((await files[0].GET(call("GET", "areas"))).status).toBe(401);
  });
});
