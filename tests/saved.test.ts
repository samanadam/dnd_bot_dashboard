import { describe, expect, it } from "vitest";
import { openDatabase, SCHEMA_VERSION } from "@/lib/dm/db";
import { MAX_SAVED, SavedRepo, savedSchema } from "@/lib/dm/saved";
import { savedCollection, savedItem } from "@/lib/dm/savedRoutes";
import { RateLimiter } from "@/lib/rateLimit";

const DM = "111111111111111111";
const PLAYER = "222222222222222222";
const CAMPAIGN = "0123456789ab";
const OTHER = "ba9876543210";

const input = (over: Record<string, unknown> = {}) => ({
  source: "youtube",
  kind: "music",
  ref: "dQw4w9WgXcQ",
  title: "Tavern theme",
  durationSeconds: 215,
  ...over,
});

function repo() {
  return new SavedRepo(openDatabase(":memory:"));
}

describe("saved link schema", () => {
  it("accepts a normal item and is strict about everything else", () => {
    expect(savedSchema.safeParse(input()).success).toBe(true);
    expect(savedSchema.safeParse(input({ extra: 1 })).success).toBe(false);
    expect(savedSchema.safeParse(input({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).success).toBe(false);
  });

  it.each([
    ["kind", { kind: "video" }],
    ["short id", { ref: "short" }],
    ["long id", { ref: "dQw4w9WgXcQx" }],
    ["id with a slash", { ref: "dQw4w9Wg/cQ" }],
    ["id that is a url", { ref: "https://youtu.be/dQw4w9WgXcQ" }],
    ["id with a newline", { ref: "dQw4w9WgXc\n" }],
    ["empty title", { title: "   " }],
    ["long title", { title: "x".repeat(201) }],
    ["control character in the title", { title: "Tavern\u0000" }],
    ["direction override in the title", { title: "Tavern\u202Egnp.exe" }],
    ["a category, which tags replaced", { category: "Taverns" }],
    ["zero length", { durationSeconds: 0 }],
    ["negative length", { durationSeconds: -3 }],
    ["fractional length", { durationSeconds: 3.5 }],
    ["huge length", { durationSeconds: 90_000 }],
    ["string length", { durationSeconds: "215" }],
    ["campaign id", { campaignId: "nope" }],
  ])("refuses %s", (_name, over) => {
    expect(savedSchema.safeParse(input(over)).success).toBe(false);
  });

  it("allows an unknown length", () => {
    expect(savedSchema.safeParse(input({ durationSeconds: null })).success).toBe(true);
  });

  it("trims titles", () => {
    expect(savedSchema.parse(input({ title: "  Rain  " }))).toMatchObject({ title: "Rain" });
  });
});

describe("saved link repository", () => {
  it("migrates to the current schema", () => {
    const db = openDatabase(":memory:");
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
    expect(() => db.prepare("SELECT * FROM saved_tracks").all()).not.toThrow();
  });

  it("creates, reads, updates and deletes", () => {
    const saved = repo();
    const created = saved.create(savedSchema.parse(input()));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.item).toMatchObject({ source: "youtube", kind: "music", ref: "dQw4w9WgXcQ", title: "Tavern theme", campaignId: null });
    expect(saved.get(created.item.id)?.title).toBe("Tavern theme");

    const updated = saved.update(created.item.id, savedSchema.parse(input({ title: "Renamed" })));
    expect(updated.ok && updated.item).toMatchObject({ title: "Renamed" });

    expect(saved.remove(created.item.id)).toBe(true);
    expect(saved.get(created.item.id)).toBeNull();
    expect(saved.remove(created.item.id)).toBe(false);
  });

  it("keeps only the id, never a link", () => {
    const db = openDatabase(":memory:");
    new SavedRepo(db).create(savedSchema.parse(input()));
    const row = db.prepare("SELECT * FROM saved_tracks").get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toMatch(/https?:|youtube\.com|youtu\.be/);
    expect(row.ref).toBe("dQw4w9WgXcQ");
  });

  it("lists by kind, then title, ignoring case", () => {
    const saved = repo();
    const add = (over: Record<string, unknown>, n: number) =>
      saved.create(savedSchema.parse(input({ ref: `aaaaaaaaaa${n}`, ...over })));
    add({ kind: "sfx", title: "Slam" }, 1);
    add({ kind: "music", title: "b" }, 2);
    add({ kind: "music", title: "A" }, 3);
    add({ kind: "ambience", title: "Rain" }, 4);
    expect(saved.list().map((item) => `${item.kind}/${item.title}`)).toEqual(["ambience/Rain", "music/A", "music/b", "sfx/Slam"]);
  });

  it("refuses the same video twice in the same kind and campaign, but not elsewhere", () => {
    const saved = repo();
    expect(saved.create(savedSchema.parse(input())).ok).toBe(true);
    expect(saved.create(savedSchema.parse(input()))).toEqual({ ok: false, reason: "duplicate" });
    expect(saved.create(savedSchema.parse(input({ kind: "sfx" }))).ok).toBe(true);
    expect(saved.create(savedSchema.parse(input({ campaignId: CAMPAIGN }))).ok).toBe(true);
    expect(saved.create(savedSchema.parse(input({ campaignId: CAMPAIGN }))).ok).toBe(false);
    expect(saved.create(savedSchema.parse(input({ campaignId: OTHER }))).ok).toBe(true);
  });

  it("refuses an update that would collide with another row", () => {
    const saved = repo();
    saved.create(savedSchema.parse(input({ kind: "sfx" })));
    const music = saved.create(savedSchema.parse(input()));
    if (!music.ok) throw new Error("setup");
    expect(saved.update(music.item.id, savedSchema.parse(input({ kind: "sfx" })))).toEqual({ ok: false, reason: "duplicate" });
    // The row is unchanged.
    expect(saved.get(music.item.id)?.kind).toBe("music");
  });

  it("scopes by campaign, keeps the campaign on a plain update, and can clear it", () => {
    const saved = repo();
    const one = saved.create(savedSchema.parse(input({ campaignId: CAMPAIGN })));
    saved.create(savedSchema.parse(input({ ref: "bbbbbbbbbbb" })));
    if (!one.ok) throw new Error("setup");
    expect(saved.list(CAMPAIGN)).toHaveLength(1);
    expect(saved.list("unassigned")).toHaveLength(1);
    expect(saved.list(null)).toHaveLength(2);

    const renamed = saved.update(one.item.id, savedSchema.parse(input({ title: "New name" })));
    expect(renamed.ok && renamed.item).toMatchObject({ title: "New name", campaignId: CAMPAIGN });
    const cleared = saved.update(one.item.id, savedSchema.parse(input({ campaignId: null })));
    expect(cleared.ok && cleared.item.campaignId).toBeNull();
  });

  it("caps the count", () => {
    const db = openDatabase(":memory:");
    const saved = new SavedRepo(db);
    const insert = db.prepare(
      "INSERT INTO saved_tracks (id, kind, ref, title, duration_seconds, campaign_id, created_at, updated_at) VALUES (?, 'music', ?, 't', NULL, NULL, 'x', 'x')",
    );
    for (let i = 0; i < MAX_SAVED; i++) insert.run(crypto.randomUUID(), String(i).padStart(11, "a"));
    expect(saved.create(savedSchema.parse(input()))).toEqual({ ok: false, reason: "limit" });
  });

  it("does not return a damaged row", () => {
    const db = openDatabase(":memory:");
    const saved = new SavedRepo(db);
    const created = saved.create(savedSchema.parse(input()));
    if (!created.ok) throw new Error("setup");
    db.prepare("UPDATE saved_tracks SET title = ? WHERE id = ?").run("Bad\u202Etitle", created.item.id);
    expect(saved.list()).toEqual([]);
    expect(saved.get(created.item.id)).toBeNull();
  });

  it("answers unknown or malformed ids with not-found", () => {
    const saved = repo();
    expect(saved.get("../../etc/passwd")).toBeNull();
    expect(saved.remove("x' OR '1'='1")).toBe(false);
    expect(saved.update("nope", savedSchema.parse(input()))).toEqual({ ok: false, reason: "missing" });
    expect(saved.update(crypto.randomUUID(), savedSchema.parse(input()))).toEqual({ ok: false, reason: "missing" });
  });

  it("treats hostile text as data, not as SQL", () => {
    const saved = repo();
    const created = saved.create(savedSchema.parse(input({ title: "'); DROP TABLE saved_tracks;--" })));
    expect(created.ok).toBe(true);
    expect(saved.list()).toHaveLength(1);
    expect(saved.list()[0].title).toBe("'); DROP TABLE saved_tracks;--");
  });
});

describe("saved link routes", () => {
  function setup(userId: string | null = DM) {
    const saved = repo();
    const logs: unknown[] = [];
    let touched = false;
    const deps = {
      getUserId: async () => userId,
      dmIds: [DM],
      limiter: new RateLimiter(),
      saved: () => {
        touched = true;
        return saved;
      },
      log: (entry: unknown) => logs.push(entry),
    };
    return { saved, logs, touched: () => touched, collection: savedCollection(deps), item: savedItem(deps) };
  }

  function req(method: string, url = "https://portal.example/api/dm/saved", body?: unknown, headers: Record<string, string> = {}) {
    return new Request(url, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        "x-portal-request": "1",
        "sec-fetch-site": "same-origin",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
    });
  }

  it("runs the whole lifecycle, auditing writes and never their contents", async () => {
    const { collection, item, logs } = setup();
    const created = await collection.POST(req("POST", undefined, input({ title: "Secret ambush theme" })));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { id } = await created.json();

    expect(await (await collection.GET(req("GET"))).json()).toHaveLength(1);
    const updated = await item.PUT(req("PUT", undefined, input({ title: "Renamed" })), id);
    expect((await updated.json()).title).toBe("Renamed");
    expect((await item.DELETE(req("DELETE"), id)).status).toBe(204);
    expect((await item.DELETE(req("DELETE"), id)).status).toBe(404);
    expect(logs).toHaveLength(3);
    expect(JSON.stringify(logs)).not.toContain("Secret ambush theme");
  });

  it("filters by campaign and refuses a malformed campaign", async () => {
    const { collection } = setup();
    await collection.POST(req("POST", undefined, input({ campaignId: CAMPAIGN })));
    await collection.POST(req("POST", undefined, input({ ref: "bbbbbbbbbbb" })));
    const scoped = await collection.GET(req("GET", `https://portal.example/api/dm/saved?campaign=${CAMPAIGN}`));
    expect(await scoped.json()).toHaveLength(1);
    expect((await collection.GET(req("GET", "https://portal.example/api/dm/saved?campaign=nope"))).status).toBe(400);
  });

  it("answers a duplicate and a full list with 409", async () => {
    const { collection } = setup();
    await collection.POST(req("POST", undefined, input()));
    const again = await collection.POST(req("POST", undefined, input()));
    expect(again.status).toBe(409);
    expect((await again.json()).error.message).toMatch(/already saved/);
  });

  it("rejects bad bodies with 400 and names the field", async () => {
    const { collection, saved } = setup();
    const bad = await collection.POST(req("POST", undefined, input({ ref: "https://evil.example/x" })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toContain("ref");
    expect((await collection.POST(req("POST", undefined, { ...input(), extra: 1 }))).status).toBe(400);
    expect((await collection.POST(req("POST", undefined, "{not json"))).status).toBe(400);
    expect(saved.list()).toEqual([]);
  });

  it("refuses non-JSON and oversize bodies", async () => {
    const { collection } = setup();
    const plain = new Request("https://portal.example/api/dm/saved", {
      method: "POST",
      body: "x",
      headers: { "x-portal-request": "1", "sec-fetch-site": "same-origin", "content-type": "text/plain" },
    });
    expect((await collection.POST(plain)).status).toBe(415);
    const huge = await collection.POST(req("POST", undefined, { ...input(), title: "x".repeat(70_000) }));
    expect(huge.status).toBe(413);
  });

  it("answers bad ids with 404 without touching the database", async () => {
    const { item, saved } = setup();
    for (const id of ["../../etc/passwd", "nope", "1' OR '1'='1"]) {
      expect((await item.PUT(req("PUT", undefined, input()), id)).status).toBe(404);
      expect((await item.DELETE(req("DELETE"), id)).status).toBe(404);
    }
    expect(saved.count()).toBe(0);
  });

  it.each([
    ["signed-out", null, {}, 401],
    ["not the DM", PLAYER, {}, 404],
    ["a cross-site request", DM, { "sec-fetch-site": "cross-site" }, 403],
    ["a request without the portal header", DM, { "x-portal-request": "0" }, 403],
  ])("guards before the repository: %s", async (_name, user, headers, status) => {
    const { collection, item, touched } = setup(user);
    const id = crypto.randomUUID();
    const responses = [
      await collection.GET(req("GET", undefined, undefined, headers)),
      await collection.POST(req("POST", undefined, input(), headers)),
      await item.PUT(req("PUT", undefined, input(), headers), id),
      await item.DELETE(req("DELETE", undefined, undefined, headers), id),
    ];
    expect(responses.map((response) => response.status)).toEqual([status, status, status, status]);
    expect(touched()).toBe(false);
  });

  it("rate limits writes", async () => {
    const { collection } = setup();
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await collection.POST(req("POST", undefined, { ...input(), ref: "bad" }))).status;
    expect(last).toBe(429);
  });
});
