import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate, openDatabase } from "@/lib/dm/db";
import { SavedRepo, savedSchema } from "@/lib/dm/saved";
import { bucketRef, hasAllTags, MAX_TAGGED, MAX_TAGS, normaliseTags, savedRef, setTagsSchema, TagRepo, tagCounts, tagsSchema } from "@/lib/dm/tags";
import { tagRoutes } from "@/lib/dm/tagRoutes";
import { RateLimiter } from "@/lib/rateLimit";

const DM = "111111111111111111";
const PLAYER = "222222222222222222";
const RAIN = "bucket:music/ambience/Tavern Rain.ogg";

function repo() {
  return new TagRepo(openDatabase(":memory:"));
}

describe("tag schema", () => {
  it("trims, collapses spaces and drops repeats regardless of case", () => {
    expect(tagsSchema.parse(["  Tavern ", "tavern", "Deep   Forest", "TAVERN"])).toEqual(["Tavern", "Deep Forest"]);
  });

  it("keeps Turkish letters and the order the tags were given in", () => {
    expect(tagsSchema.parse(["Şehir", "Ejderha", "orman-gecesi"])).toEqual(["Şehir", "Ejderha", "orman-gecesi"]);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["too long", "x".repeat(33)],
    ["a comma", "a,b"],
    ["a newline", "tav\nern"],
    ["a control character", "tav\u0000ern"],
    ["a direction override", "tav\u202Eern"],
  ])("refuses a tag that is %s", (_name, tag) => {
    expect(tagsSchema.safeParse([tag]).success).toBe(false);
  });

  it("allows at most twelve tags", () => {
    const many = Array.from({ length: MAX_TAGS }, (_, index) => `tag${index}`);
    expect(tagsSchema.safeParse(many).success).toBe(true);
    expect(tagsSchema.safeParse([...many, "one more"]).success).toBe(false);
  });

  it("only takes a bucket key or a saved-link id as the thing being tagged", () => {
    const ok = (ref: unknown) => setTagsSchema.safeParse({ ref, tags: ["a"] }).success;
    expect(ok(RAIN)).toBe(true);
    expect(ok(savedRef(crypto.randomUUID()))).toBe(true);
    expect(ok("bucket:")).toBe(false);
    expect(ok("saved:not-a-uuid")).toBe(false);
    expect(ok("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(ok("bucket:bad\u0000key")).toBe(false);
    expect(ok(`bucket:${"k".repeat(513)}`)).toBe(false);
    expect(setTagsSchema.safeParse({ ref: RAIN, tags: ["a"], extra: 1 }).success).toBe(false);
  });

  it("filters by every selected tag, ignoring case", () => {
    expect(hasAllTags(["Tavern", "Rain"], [])).toBe(true);
    expect(hasAllTags(["Tavern", "Rain"], ["rain"])).toBe(true);
    expect(hasAllTags(["Tavern", "Rain"], ["Rain", "TAVERN"])).toBe(true);
    expect(hasAllTags(["Tavern", "Rain"], ["Rain", "Battle"])).toBe(false);
    expect(hasAllTags([], ["Rain"])).toBe(false);
  });

  it("normalises a list typed by hand", () => {
    expect(normaliseTags(["a  b", "A B", "c"])).toEqual(["a b", "c"]);
  });

  it("builds refs from ids", () => {
    expect(bucketRef("music/sfx/Boom.ogg")).toBe("bucket:music/sfx/Boom.ogg");
    expect(savedRef("abc")).toBe("saved:abc");
  });
});

describe("tag repository", () => {
  it("replaces a sound's whole tag set in one call", () => {
    const tags = repo();
    expect(tags.set(RAIN, ["Tavern", "Rain"])).toEqual({ ok: true, tags: ["Rain", "Tavern"] });
    expect(tags.set(RAIN, ["Storm"])).toEqual({ ok: true, tags: ["Storm"] });
    expect(tags.get(RAIN)).toEqual(["Storm"]);
  });

  it("clears a sound's tags with an empty list", () => {
    const tags = repo();
    tags.set(RAIN, ["Rain"]);
    expect(tags.set(RAIN, [])).toEqual({ ok: true, tags: [] });
    expect(tags.all()).toEqual({});
  });

  it("lists every tagged sound, tags sorted ignoring case", () => {
    const tags = repo();
    tags.set(RAIN, ["tavern", "Battle", "arena"]);
    tags.set("bucket:music/sfx/Boom.ogg", ["Battle"]);
    expect(tags.all()).toEqual({
      [RAIN]: ["arena", "Battle", "tavern"],
      "bucket:music/sfx/Boom.ogg": ["Battle"],
    });
  });

  it("keeps the same tag on different sounds apart", () => {
    const tags = repo();
    tags.set(RAIN, ["Rain"]);
    tags.set("bucket:music/ambience/Storm.ogg", ["Rain"]);
    tags.set(RAIN, []);
    expect(tags.all()).toEqual({ "bucket:music/ambience/Storm.ogg": ["Rain"] });
  });

  it("counts how many sounds use each tag", () => {
    const counts = tagCounts({ a: ["Rain", "Tavern"], b: ["rain"], c: ["Battle"] });
    expect(counts).toEqual([
      { tag: "Battle", count: 1 },
      { tag: "Rain", count: 2 },
      { tag: "Tavern", count: 1 },
    ]);
  });

  it("caps how many sounds can carry tags, but always lets a tagged one change", () => {
    const db = openDatabase(":memory:");
    const tags = new TagRepo(db);
    const insert = db.prepare("INSERT INTO sound_tags (ref, tag) VALUES (?, 'x')");
    for (let index = 0; index < MAX_TAGGED; index++) insert.run(`bucket:k${index}`);
    expect(tags.set("bucket:one-too-many", ["a"])).toEqual({ ok: false, reason: "limit" });
    expect(tags.set("bucket:k1", ["a"]).ok).toBe(true);
    expect(tags.set("bucket:one-too-many", []).ok).toBe(true);
  });

  it("treats hostile text as data, not as SQL", () => {
    const tags = repo();
    const ref = "bucket:x'); DROP TABLE sound_tags;--";
    expect(tags.set(ref, ["' OR 1=1 --"]).ok).toBe(true);
    expect(tags.all()).toEqual({ [ref]: ["' OR 1=1 --"] });
  });

  it("does not return a damaged row", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO sound_tags (ref, tag) VALUES (?, ?)").run(RAIN, "Bad\u202Etag");
    expect(new TagRepo(db).all()).toEqual({});
  });
});

describe("saved links and their tags", () => {
  const link = (over: Record<string, unknown> = {}) =>
    savedSchema.parse({ source: "youtube", kind: "music", ref: "dQw4w9WgXcQ", title: "Tavern theme", durationSeconds: 215, ...over });

  it("removes a saved link's tags along with the link", () => {
    const db = openDatabase(":memory:");
    const saved = new SavedRepo(db);
    const tags = new TagRepo(db);
    const created = saved.create(link());
    if (!created.ok) throw new Error("setup");
    tags.set(savedRef(created.item.id), ["Taverns"]);
    tags.set(RAIN, ["Rain"]);

    expect(saved.remove(created.item.id)).toBe(true);
    expect(tags.all()).toEqual({ [RAIN]: ["Rain"] });
  });

  it("turns each existing category into a tag when the database is upgraded", () => {
    const db = new DatabaseSync(":memory:");
    // Version 7 is the last one before sound_tags, whatever has been added since.
    migrate(db, 7);
    const insert = db.prepare(
      "INSERT INTO saved_tracks (id, source, kind, ref, title, duration_seconds, category, campaign_id, created_at, updated_at) VALUES (?, 'youtube', 'music', ?, 't', NULL, ?, NULL, 'x', 'x')",
    );
    insert.run("11111111-1111-4111-8111-111111111111", "aaaaaaaaaaa", "Taverns");
    insert.run("22222222-2222-4222-8222-222222222222", "bbbbbbbbbbb", "Inns, Pubs");
    insert.run("33333333-3333-4333-8333-333333333333", "ccccccccccc", "");
    insert.run("44444444-4444-4444-8444-444444444444", "ddddddddddd", " , ");

    migrate(db);

    expect(new TagRepo(db).all()).toEqual({
      "saved:11111111-1111-4111-8111-111111111111": ["Taverns"],
      "saved:22222222-2222-4222-8222-222222222222": ["Inns Pubs"],
    });
    expect(() => db.prepare("SELECT category FROM saved_tracks").all()).not.toThrow();
  });
});

describe("tag routes", () => {
  function setup(userId: string | null = DM) {
    const tags = repo();
    const logs: unknown[] = [];
    let touched = false;
    const routes = tagRoutes({
      getUserId: async () => userId,
      dmIds: [DM],
      limiter: new RateLimiter(),
      tags: () => {
        touched = true;
        return tags;
      },
      log: (entry: unknown) => logs.push(entry),
    });
    return { tags, logs, routes, touched: () => touched };
  }

  function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
    return new Request("https://portal.example/api/dm/tags", {
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

  it("sets, lists and clears tags, auditing writes and never their contents", async () => {
    const { routes, logs } = setup();
    const set = await routes.PUT(req("PUT", { ref: RAIN, tags: ["Secret ambush", "Rain"] }));
    expect(set.status).toBe(200);
    expect(set.headers.get("cache-control")).toBe("no-store");
    expect(await set.json()).toEqual({ ref: RAIN, tags: ["Rain", "Secret ambush"] });

    expect(await (await routes.GET(req("GET"))).json()).toEqual({ [RAIN]: ["Rain", "Secret ambush"] });
    expect((await routes.PUT(req("PUT", { ref: RAIN, tags: [] }))).status).toBe(200);
    expect(await (await routes.GET(req("GET"))).json()).toEqual({});
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain("Secret ambush");
  });

  it("rejects bad bodies with 400 and names the field", async () => {
    const { routes, tags } = setup();
    const bad = await routes.PUT(req("PUT", { ref: "https://evil.example/x", tags: ["a"] }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toContain("ref");
    expect((await routes.PUT(req("PUT", { ref: RAIN, tags: ["a,b"] }))).status).toBe(400);
    expect((await routes.PUT(req("PUT", { ref: RAIN, tags: "a" }))).status).toBe(400);
    expect((await routes.PUT(req("PUT", "{not json"))).status).toBe(400);
    expect(tags.all()).toEqual({});
  });

  it("answers a full tag list with 409", async () => {
    const { routes, tags } = setup();
    const db = (tags as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } } }).db;
    for (let index = 0; index < MAX_TAGGED; index++) db.prepare("INSERT INTO sound_tags (ref, tag) VALUES (?, 'x')").run(`bucket:k${index}`);
    expect((await routes.PUT(req("PUT", { ref: "bucket:new", tags: ["a"] }))).status).toBe(409);
  });

  it.each([
    ["signed-out", null, {}, 401],
    ["not the DM", PLAYER, {}, 404],
    ["a cross-site request", DM, { "sec-fetch-site": "cross-site" }, 403],
    ["a request without the portal header", DM, { "x-portal-request": "0" }, 403],
  ])("guards before the repository: %s", async (_name, user, headers, status) => {
    const { routes, touched } = setup(user);
    const responses = [await routes.GET(req("GET", undefined, headers)), await routes.PUT(req("PUT", { ref: RAIN, tags: ["a"] }, headers))];
    expect(responses.map((response) => response.status)).toEqual([status, status]);
    expect(touched()).toBe(false);
  });
});
