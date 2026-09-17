import { describe, expect, it } from "vitest";
import { creatureCollection, creatureItem } from "@/lib/dm/creatureRoutes";
import { CreatureRepo } from "@/lib/dm/creatures";
import { openDatabase } from "@/lib/dm/db";
import { RateLimiter } from "@/lib/rateLimit";
import { goblin } from "./fixtures/goblin";

const DM = "111111111111111111";

function setup() {
  const repo = new CreatureRepo(openDatabase(":memory:"));
  const logs: unknown[] = [];
  const deps = {
    getUserId: async () => DM,
    dmIds: [DM],
    limiter: new RateLimiter(),
    repo: () => repo,
    log: (entry: unknown) => logs.push(entry),
  };
  return { repo, logs, collection: creatureCollection(deps), item: creatureItem(deps) };
}

function req(method: string, url = "https://portal.example/api/dm/creatures", body?: unknown) {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "x-portal-request": "1",
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
}

const input = { kind: "monster", statBlock: goblin, notes: "", tags: [] };

describe("creature routes", () => {
  it("full lifecycle, auditing writes only and never their contents", async () => {
    const { collection, item, logs } = setup();
    const created = await collection.POST(req("POST", undefined, input));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { id } = await created.json();

    expect((await collection.GET(req("GET"))).status).toBe(200);
    expect(await (await collection.GET(req("GET", "https://portal.example/api/dm/creatures?kind=npc"))).json()).toEqual([]);
    expect((await item.GET(req("GET"), id)).status).toBe(200);

    const updated = await item.PUT(req("PUT", undefined, { ...input, notes: "secret boss plan" }), id);
    expect((await updated.json()).notes).toBe("secret boss plan");

    expect((await item.DELETE(req("DELETE"), id)).status).toBe(204);
    expect((await item.GET(req("GET"), id)).status).toBe(404);
    expect(logs).toHaveLength(3);
    expect(JSON.stringify(logs)).not.toContain("secret boss plan");
  });

  it("rejects invalid bodies, ids and query values", async () => {
    const { collection, item } = setup();
    expect((await collection.POST(req("POST", undefined, { ...input, extra: 1 }))).status).toBe(400);
    const badHp = await collection.POST(req("POST", undefined, { ...input, statBlock: { ...goblin, hp: -1 } }));
    expect(badHp.status).toBe(400);
    expect((await badHp.json()).error.message).toContain("statBlock.hp");
    expect((await item.GET(req("GET"), "../../etc/passwd")).status).toBe(404);
    expect((await item.PUT(req("PUT", undefined, input), "nope")).status).toBe(404);
    expect((await collection.GET(req("GET", "https://portal.example/api/dm/creatures?kind=dragon"))).status).toBe(400);
  });

  it("guards before touching the repository", async () => {
    let touched = false;
    const deps = {
      getUserId: async () => "222222222222222222",
      dmIds: [DM],
      limiter: new RateLimiter(),
      repo: () => {
        touched = true;
        throw new Error("must not be called");
      },
    };
    expect((await creatureCollection(deps).GET(req("GET"))).status).toBe(404);
    expect((await creatureItem(deps).DELETE(req("DELETE"), "00000000-0000-4000-8000-000000000001")).status).toBe(404);
    expect(touched).toBe(false);
  });
});
