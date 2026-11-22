import { describe, expect, it } from "vitest";
import type { Grant } from "@/lib/access/permissions";
import { openDatabase } from "@/lib/dm/db";
import { STARTER_NOTES, StoryRepo } from "@/lib/dm/story";
import { storyCollection, storyItem, storyStarter, type StoryDetail } from "@/lib/dm/storyRoutes";
import { RateLimiter } from "@/lib/rateLimit";
import { grantedAccess, ownerAccess } from "./helpers/access";

const DM = "111111111111111111";
const PLAYER = "222222222222222222";
const ROLE = "333333333333333333";
const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";
const GRANTS: Grant[] = [{ roleId: ROLE, permissions: ["dm"], scope: [A] }];

function req(method: string, path: string, body?: unknown) {
  return new Request(`https://portal.example/api/dm/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
}

function setup(getAccess = ownerAccess(DM, [DM])) {
  const db = openDatabase(":memory:");
  const logs: { event?: string }[] = [];
  const deps = { getAccess, limiter: new RateLimiter(), story: () => new StoryRepo(db), log: (entry: { event?: string }) => logs.push(entry) } as Parameters<typeof storyCollection>[0];
  return { db, deps, logs };
}

const input = (title: string, extra: Record<string, unknown> = {}) => ({ title, type: "place", tags: ["town"], body: "", ...extra });

async function create(deps: ReturnType<typeof setup>["deps"], title: string, extra: Record<string, unknown> = {}): Promise<StoryDetail> {
  const response = await storyCollection(deps).POST(req("POST", "story/notes", input(title, extra)));
  expect(response.status).toBe(201);
  return response.json();
}

describe("story routes", () => {
  it("answers 401 to a signed-out caller and 404 to a non-DM, on every route", async () => {
    for (const access of [ownerAccess(null, []), ownerAccess(PLAYER, [DM])]) {
      const { deps } = setup(access);
      const status = access === undefined ? 0 : (await access()) ? 404 : 401;
      const calls = [
        storyCollection(deps).GET(req("GET", "story/notes")),
        storyCollection(deps).POST(req("POST", "story/notes", input("x"))),
        storyItem(deps).GET(req("GET", "story/notes/x"), "00000000-0000-4000-8000-000000000001"),
        storyItem(deps).PUT(req("PUT", "story/notes/x", { ...input("x"), version: 1 }), "00000000-0000-4000-8000-000000000001"),
        storyItem(deps).DELETE(req("DELETE", "story/notes/x"), "00000000-0000-4000-8000-000000000001"),
        storyStarter(deps).POST(req("POST", "story/starter", { campaignId: null })),
      ];
      for (const response of await Promise.all(calls)) expect(response.status).toBe(status);
    }
  });

  it("creates, lists, reads with backlinks, edits and deletes, and logs each write", async () => {
    const { deps, logs } = setup();
    const inn = await create(deps, "Inn");
    const fan = await create(deps, "Fan", { body: "see [[Inn]] and [[Ghost]]" });
    expect(fan.missing).toEqual(["Ghost"]);

    const list = await (await storyCollection(deps).GET(req("GET", "story/notes"))).json();
    expect(list).toHaveLength(2);
    expect(list.find((s: { id: string }) => s.id === fan.note.id)).toMatchObject({ links: [inn.note.id], missing: ["Ghost"] });

    const read: StoryDetail = await (await storyItem(deps).GET(req("GET", "x"), inn.note.id)).json();
    expect(read.backlinks).toEqual([{ id: fan.note.id, title: "Fan" }]);

    const put = await storyItem(deps).PUT(req("PUT", "x", { ...input("Inn", { body: "Warm." }), version: 1 }), inn.note.id);
    expect(put.status).toBe(200);
    expect((await put.json()).note).toMatchObject({ body: "Warm.", version: 2 });

    expect((await storyItem(deps).DELETE(req("DELETE", "x"), inn.note.id)).status).toBe(204);
    expect((await storyItem(deps).GET(req("GET", "x"), inn.note.id)).status).toBe(404);
    expect(logs.filter((l) => l.event === "dm_write")).toHaveLength(4);
  });

  it("refuses a duplicate title with 409", async () => {
    const { deps } = setup();
    await create(deps, "Goblin");
    const response = await storyCollection(deps).POST(req("POST", "story/notes", input(" goblin ")));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/title/i);
  });

  it("answers 409 conflict to a stale version, and 400 to an unknown field", async () => {
    const { deps } = setup();
    const made = await create(deps, "Inn");
    await storyItem(deps).PUT(req("PUT", "x", { ...input("Inn", { body: "a" }), version: 1 }), made.note.id);
    const stale = await storyItem(deps).PUT(req("PUT", "x", { ...input("Inn", { body: "b" }), version: 1 }), made.note.id);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("conflict");
    const bad = await storyItem(deps).PUT(req("PUT", "x", { ...input("Inn"), version: 2, extra: true }), made.note.id);
    expect(bad.status).toBe(400);
  });

  it("seeds the starter set once", async () => {
    const { deps } = setup();
    const first = await storyStarter(deps).POST(req("POST", "story/starter", { campaignId: A }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ seeded: STARTER_NOTES.length });
    expect(await (await storyStarter(deps).POST(req("POST", "story/starter", { campaignId: A }))).json()).toEqual({ seeded: 0 });
  });
});

describe("a co-DM scoped to one campaign", () => {
  it("works in A and gets 404 for B, for none, and for moving a note out of A", async () => {
    const { db, deps } = setup(grantedAccess(DM, [ROLE], GRANTS));
    const repo = new StoryRepo(db);
    const inB = repo.create({ title: "Elsewhere", type: "place", tags: [], body: "", campaignId: B });
    if (typeof inB === "string") throw new Error(inB);

    const mine = await create(deps, "Mine", { campaignId: A });
    expect((await storyItem(deps).GET(req("GET", "x"), inB.id)).status).toBe(404);
    expect((await storyCollection(deps).POST(req("POST", "story/notes", input("Out", { campaignId: B })))).status).toBe(404);
    expect((await storyCollection(deps).POST(req("POST", "story/notes", input("None", { campaignId: null })))).status).toBe(404);
    expect((await storyItem(deps).PUT(req("PUT", "x", { ...input("Mine", { campaignId: B }), version: 1 }), mine.note.id)).status).toBe(404);
    expect((await storyStarter(deps).POST(req("POST", "story/starter", { campaignId: B }))).status).toBe(404);
    const list = await (await storyCollection(deps).GET(req("GET", "story/notes"))).json();
    expect(list.map((s: { title: string }) => s.title)).toEqual(["Mine"]);
  });
});
