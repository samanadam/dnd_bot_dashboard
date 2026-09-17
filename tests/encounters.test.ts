import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { encounterCollection, encounterItem } from "@/lib/dm/encounterRoutes";
import { EncounterRepo } from "@/lib/dm/encounters";
import { RateLimiter } from "@/lib/rateLimit";

const DM = "111111111111111111";

describe("EncounterRepo", () => {
  it("creates, saves with versions and detects conflicts", () => {
    const repo = new EncounterRepo(openDatabase(":memory:"));
    const created = repo.create("Road ambush");
    expect(created.version).toBe(1);
    const saved = repo.save(created.id, 1, { ...created.encounter, round: 2 });
    expect(saved).toMatchObject({ version: 2, encounter: { round: 2 } });
    expect(repo.save(created.id, 1, created.encounter)).toBe("conflict");
    expect(repo.save("00000000-0000-4000-8000-000000000000", 1, created.encounter)).toBeNull();
    expect(repo.save("../x", 1, created.encounter)).toBeNull();
    expect(repo.list()).toEqual([{ id: created.id, name: "Road ambush", round: 2, combatants: 0, updatedAt: expect.any(String) }]);
    expect(repo.remove(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
  });
});

function setup() {
  const repo = new EncounterRepo(openDatabase(":memory:"));
  const logs: unknown[] = [];
  const deps = { getUserId: async () => DM, dmIds: [DM], limiter: new RateLimiter(), encounters: () => repo, log: (e: unknown) => logs.push(e) };
  return { logs, collection: encounterCollection(deps), item: encounterItem(deps) };
}

const req = (method: string, body?: unknown) =>
  new Request("https://portal.example/api/dm/encounters", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });

describe("encounter routes", () => {
  it("create, save, conflict with the current state, delete", async () => {
    const { collection, item, logs } = setup();
    const created = await (await collection.POST(req("POST", { name: "Ambush" }))).json();
    expect((await collection.GET(req("GET"))).status).toBe(200);
    const ok = await item.PUT(req("PUT", { version: 1, encounter: { ...created.encounter, round: 1 } }), created.id);
    expect(ok.status).toBe(200);
    const conflict = await item.PUT(req("PUT", { version: 1, encounter: created.encounter }), created.id);
    expect(conflict.status).toBe(409);
    const payload = await conflict.json();
    expect(payload.error.code).toBe("conflict");
    expect(payload.current.version).toBe(2);
    expect((await item.DELETE(req("DELETE"), created.id)).status).toBe(204);
    expect((await item.GET(req("GET"), created.id)).status).toBe(404);
    expect(logs).toHaveLength(3);
  });

  it("validates bodies and ids", async () => {
    const { collection, item } = setup();
    expect((await collection.POST(req("POST", { name: "" }))).status).toBe(400);
    expect((await collection.POST(req("POST", { name: "A", round: 3 }))).status).toBe(400);
    const created = await (await collection.POST(req("POST", { name: "A" }))).json();
    expect((await item.PUT(req("PUT", { version: "1", encounter: created.encounter }), created.id)).status).toBe(400);
    expect((await item.PUT(req("PUT", { version: 1, encounter: { ...created.encounter, hacked: 1 } }), created.id)).status).toBe(400);
    expect((await item.GET(req("GET"), "not-an-id")).status).toBe(404);
  });

  it("refuses non-DM users before touching storage", async () => {
    const deps = {
      getUserId: async () => "222222222222222222",
      dmIds: [DM],
      limiter: new RateLimiter(),
      encounters: () => {
        throw new Error("must not be called");
      },
    };
    expect((await encounterCollection(deps).GET(req("GET"))).status).toBe(404);
    expect((await encounterItem(deps).PUT(req("PUT", {}), "00000000-0000-4000-8000-000000000001")).status).toBe(404);
  });
});
