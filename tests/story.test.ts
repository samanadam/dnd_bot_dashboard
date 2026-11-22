import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { extractLinks, MAX_STORY_NOTES, STARTER_NOTES, StoryRepo, type StoryInput } from "@/lib/dm/story";

const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";

const note = (title: string, body = "", campaignId: string | null = A): StoryInput => ({ title, type: "place", tags: [], body, campaignId });

function repo() {
  let n = 0;
  const db = openDatabase(":memory:");
  const hex = () => (++n).toString(16).padStart(12, "0");
  return { db, story: new StoryRepo(db, () => new Date("2026-11-22T10:00:00Z"), () => `00000000-0000-4000-8000-${hex()}`) };
}
const created = (value: ReturnType<StoryRepo["create"]>) => {
  if (typeof value === "string") throw new Error(value);
  return value;
};

describe("extractLinks", () => {
  it("keeps the first spelling of each title, trimmed, in order", () => {
    expect(extractLinks("a [[Goblin]] b [[ goblin ]] [[Inn]]")).toEqual(["Goblin", "Inn"]);
  });
});

describe("StoryRepo", () => {
  it("round-trips a note", () => {
    const { story } = repo();
    const made = created(story.create({ title: "Inn", type: "place", tags: ["town"], body: "Warm.", campaignId: A }));
    expect(story.get(made.id)).toMatchObject({ title: "Inn", type: "place", tags: ["town"], body: "Warm.", campaignId: A, version: 1 });
  });

  it("refuses a duplicate title per campaign, ignoring case and spaces", () => {
    const { story } = repo();
    created(story.create(note("Goblin")));
    expect(story.create(note(" goblin "))).toBe("duplicate");
    expect(story.create(note(" goblin ", "", B))).toMatchObject({ title: "goblin" });
    expect(story.create(note("goblin", "", null))).toMatchObject({ campaignId: null });
  });

  it("lists resolved links and missing titles, never across campaigns", () => {
    const { story } = repo();
    const goblin = created(story.create(note("Goblin", "", A)));
    created(story.create(note("Goblin", "", B)));
    const inn = created(story.create(note("Inn", "see [[Goblin]] and [[Ghost]]", A)));
    const other = created(story.create(note("Cave", "[[Goblin]] [[Inn]]", B)));
    const list = story.list(null);
    expect(list.find((s) => s.id === inn.id)).toMatchObject({ links: [goblin.id], missing: ["Ghost"] });
    expect(list.find((s) => s.id === other.id)!.missing).toEqual(["Inn"]);
    expect(story.list(A).map((s) => s.id).sort()).toEqual([goblin.id, inn.id].sort());
  });

  it("reports a stale version as a conflict", () => {
    const { story } = repo();
    const made = created(story.create(note("Inn")));
    expect(story.update(made.id, 1, note("Inn", "x"))).toMatchObject({ version: 2 });
    expect(story.update(made.id, 1, note("Inn", "y"))).toBe("conflict");
    expect(story.update("00000000-0000-4000-8000-ffffffffffff", 1, note("Q"))).toBeNull();
  });

  it("refuses a rename onto an existing title and changes nothing else", () => {
    const { story } = repo();
    const inn = created(story.create(note("Inn")));
    created(story.create(note("Tavern")));
    const fan = created(story.create(note("Fan", "[[Inn]]")));
    expect(story.update(inn.id, 1, note("tavern"))).toBe("duplicate");
    expect(story.get(fan.id)!.body).toBe("[[Inn]]");
    expect(story.get(fan.id)!.version).toBe(1);
    expect(story.get(inn.id)!.version).toBe(1);
  });

  it("rewrites links to a renamed note in the same campaign only", () => {
    const { story } = repo();
    const inn = created(story.create(note("Inn")));
    const fan = created(story.create(note("Fan", "go to [[inn]] or [[ Inn ]]")));
    const far = created(story.create(note("Far", "[[Inn]]", B)));
    expect(story.update(inn.id, 1, note("Tavern"))).toMatchObject({ title: "Tavern" });
    expect(story.get(fan.id)).toMatchObject({ body: "go to [[Tavern]] or [[Tavern]]", version: 2 });
    expect(story.get(far.id)).toMatchObject({ body: "[[Inn]]", version: 1 });
  });

  it("leaves links to a deleted note as missing", () => {
    const { story } = repo();
    const inn = created(story.create(note("Inn")));
    const fan = created(story.create(note("Fan", "[[Inn]]")));
    expect(story.delete(inn.id)).toBe(true);
    expect(story.delete(inn.id)).toBe(false);
    expect(story.list(A).find((s) => s.id === fan.id)).toMatchObject({ links: [], missing: ["Inn"] });
  });

  it("lists backlinks", () => {
    const { story } = repo();
    const inn = created(story.create(note("Inn")));
    const fan = created(story.create(note("Fan", "[[Inn]]")));
    expect(story.backlinks(inn.id)).toEqual([{ id: fan.id, title: "Fan" }]);
  });

  it("stops at the per-campaign limit", () => {
    const { db, story } = repo();
    const insert = db.prepare("INSERT INTO story_notes (id, campaign_id, title, type, tags, body, version, created_at, updated_at) VALUES (?, ?, ?, 'other', '[]', '', 1, 'x', 'x')");
    db.exec("BEGIN");
    for (let i = 0; i < MAX_STORY_NOTES; i++) insert.run(`id${i}`, A, `n${i}`);
    db.exec("COMMIT");
    expect(story.create(note("one more"))).toBe("limit");
    expect(story.create(note("one more", "", B))).toMatchObject({ campaignId: B });
  });

  it("seeds the starter set once, only into an empty campaign", () => {
    const { story } = repo();
    expect(story.seedStarter(A)).toBe(4);
    expect(story.seedStarter(A)).toBe(0);
    created(story.create(note("Mine", "", B)));
    expect(story.seedStarter(B)).toBe(0);
    const list = story.list(A);
    expect(list).toHaveLength(STARTER_NOTES.length);
    expect(list.every((s) => s.missing.length === 0)).toBe(true);
    expect(list.some((s) => s.links.length > 0)).toBe(true);
  });
});
