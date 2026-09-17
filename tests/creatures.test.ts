import { describe, expect, it } from "vitest";
import { CreatureRepo, creatureInputSchema } from "@/lib/dm/creatures";
import { openDatabase, SCHEMA_VERSION } from "@/lib/dm/db";
import { goblin } from "./fixtures/goblin";

function repo() {
  let n = 0;
  const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  let t = Date.parse("2026-09-16T10:00:00Z");
  return new CreatureRepo(openDatabase(":memory:"), () => new Date((t += 1000)), ids);
}

const input = { kind: "monster" as const, statBlock: goblin, notes: "", tags: ["goblin"] };

describe("openDatabase", () => {
  it("runs every migration", () => {
    const db = openDatabase(":memory:");
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
  });
});

describe("CreatureRepo", () => {
  it("creates, reads, lists by kind, updates and removes", () => {
    const r = repo();
    const created = r.create(input);
    const npc = r.create({ ...input, kind: "npc", statBlock: { ...goblin, name: "Sildar" }, notes: "Knight of the Order" });
    expect(r.get(created.id)).toEqual(created);
    expect(r.list().map((c) => c.id)).toEqual([created.id, npc.id]);
    expect(r.list("npc").map((c) => c.statBlock.name)).toEqual(["Sildar"]);

    const updated = r.update(created.id, { ...input, notes: "ambush at the road" });
    expect(updated?.notes).toBe("ambush at the road");
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.updatedAt).not.toBe(created.updatedAt);

    expect(r.remove(created.id)).toBe(true);
    expect(r.get(created.id)).toBeNull();
    expect(r.remove(created.id)).toBe(false);
    expect(r.update("00000000-0000-4000-8000-999999999999", input)).toBeNull();
  });

  it("stores text as parameters, never as SQL", () => {
    const r = repo();
    const evil = r.create({ ...input, notes: "'); DROP TABLE creatures; --" });
    expect(r.get(evil.id)?.notes).toBe("'); DROP TABLE creatures; --");
    expect(r.list()).toHaveLength(1);
  });

  it("refuses malformed ids without querying", () => {
    const r = repo();
    expect(r.get("../../etc/passwd")).toBeNull();
    expect(r.remove("' OR 1=1 --")).toBe(false);
  });

  it("re-validates rows on read so a corrupt row cannot reach a page", () => {
    const db = openDatabase(":memory:");
    const r = new CreatureRepo(db);
    const created = r.create(input);
    db.prepare("UPDATE creatures SET data = ? WHERE id = ?").run('{"broken":true}', created.id);
    expect(r.get(created.id)).toBeNull();
    expect(r.list()).toEqual([]);
  });
});

describe("creatureInputSchema", () => {
  it("rejects unknown kinds, fields and too many tags", () => {
    expect(creatureInputSchema.safeParse({ ...input, kind: "dragon" }).success).toBe(false);
    expect(creatureInputSchema.safeParse({ ...input, owner: "x" }).success).toBe(false);
    expect(creatureInputSchema.safeParse({ ...input, tags: Array(21).fill("x") }).success).toBe(false);
  });
});
