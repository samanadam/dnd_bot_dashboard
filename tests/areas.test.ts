import { describe, expect, it } from "vitest";
import { AreaRepo, MAX_AREAS } from "@/lib/dm/areas";
import { openDatabase } from "@/lib/dm/db";
import { EncounterRepo } from "@/lib/dm/encounters";
import { rewardInputSchema, type RewardInput } from "@/lib/dm/rewards";

const CAMPAIGN = "0123456789ab";

function setup() {
  const db = openDatabase(":memory:");
  const areas = new AreaRepo(db);
  const encounters = new EncounterRepo(db);
  const area = areas.create({ name: "Goblin cave", summary: "", notes: "" })!;
  return { db, areas, encounters, area };
}

const item = (over: Partial<Extract<RewardInput, { kind: "item" }>> = {}): RewardInput => ({
  kind: "item",
  encounterId: null,
  status: "planned",
  itemRef: { source: "srd", edition: "2014", slug: "longsword" },
  quantity: 1,
  note: "",
  ...over,
});

const pointer = (over: Partial<Extract<RewardInput, { kind: "pointer" }>> = {}): RewardInput => ({
  kind: "pointer",
  encounterId: null,
  status: "pending",
  title: "The village owes you",
  condition: "Save the mayor",
  outcome: "They shelter the party in act 3",
  npcRef: null,
  ...over,
});

describe("areas", () => {
  it("creates, reads, updates with a version, and deletes", () => {
    const { areas, area } = setup();
    expect(area).toMatchObject({ name: "Goblin cave", version: 1, campaignId: null, position: 0 });

    const updated = areas.update(area.id, 1, { name: "Goblin den", summary: "Damp", notes: "trap at the door", campaignId: CAMPAIGN });
    expect(updated).toMatchObject({ name: "Goblin den", version: 2, campaignId: CAMPAIGN });
    // The same base version again has lost the race.
    expect(areas.update(area.id, 1, { name: "Late", summary: "", notes: "" })).toBe("conflict");
    expect(areas.update("00000000-0000-4000-8000-000000000000", 1, { name: "x", summary: "", notes: "" })).toBeNull();

    expect(areas.remove(area.id)).toBe(true);
    expect(areas.get(area.id)).toBeNull();
  });

  it("keeps the campaign when an update leaves it out", () => {
    const { areas } = setup();
    const created = areas.create({ name: "Tavern", summary: "", notes: "", campaignId: CAMPAIGN })!;
    areas.update(created.id, 1, { name: "Tavern 2", summary: "", notes: "" });
    expect(areas.get(created.id)).toMatchObject({ name: "Tavern 2", campaignId: CAMPAIGN });
  });

  it("orders by position and lets the DM reorder", () => {
    const { areas, area } = setup();
    const second = areas.create({ name: "Bridge", summary: "", notes: "" })!;
    const third = areas.create({ name: "Tower", summary: "", notes: "" })!;
    expect(areas.list().map((entry) => entry.name)).toEqual(["Goblin cave", "Bridge", "Tower"]);
    areas.reorder([third.id, area.id, second.id]);
    expect(areas.list().map((entry) => entry.name)).toEqual(["Tower", "Goblin cave", "Bridge"]);
  });

  it("filters the list by campaign selection", () => {
    const { areas } = setup();
    areas.create({ name: "In campaign", summary: "", notes: "", campaignId: CAMPAIGN });
    expect(areas.list(CAMPAIGN).map((entry) => entry.name)).toEqual(["In campaign"]);
    expect(areas.list("unassigned").map((entry) => entry.name)).toEqual(["Goblin cave"]);
  });

  it("stops at the area limit for a campaign", () => {
    const { db, areas } = setup();
    const insert = db.prepare("INSERT INTO areas (id, campaign_id, name, created_at, updated_at) VALUES (?, ?, 'x', '', '')");
    for (let index = 0; index < MAX_AREAS; index++) insert.run(`id-${index}`, CAMPAIGN);
    expect(areas.create({ name: "One too many", summary: "", notes: "", campaignId: CAMPAIGN })).toBeNull();
    // Another campaign has its own allowance.
    expect(areas.create({ name: "Fine", summary: "", notes: "" })).not.toBeNull();
  });
});

describe("battles", () => {
  it("links prepared encounters in order and rejects anything else", () => {
    const { areas, encounters, area } = setup();
    const a = encounters.create("Ambush", null, "prepared");
    const b = encounters.create("Boss", null, "prepared");
    const live = encounters.create("Running", null, "live");

    const linked = areas.setEncounters(area.id, 1, [b.id, a.id]);
    expect(linked).toMatchObject({ version: 2 });
    expect(areas.encounterIds(area.id)).toEqual([b.id, a.id]);

    expect(areas.setEncounters(area.id, 2, [live.id])).toBe("not_prepared");
    expect(areas.setEncounters(area.id, 2, ["00000000-0000-4000-8000-000000000000"])).toBe("not_prepared");
    // Nothing changed by the refusals.
    expect(areas.encounterIds(area.id)).toEqual([b.id, a.id]);
    expect(areas.get(area.id)?.version).toBe(2);
  });

  it("refuses a stale version and duplicates collapse", () => {
    const { areas, encounters, area } = setup();
    const a = encounters.create("Ambush", null, "prepared");
    expect(areas.setEncounters(area.id, 9, [a.id])).toBe("conflict");
    areas.setEncounters(area.id, 1, [a.id, a.id]);
    expect(areas.encounterIds(area.id)).toEqual([a.id]);
  });

  it("keeps a link whose encounter was deleted, and lets it be dropped", () => {
    const { areas, encounters, area } = setup();
    const a = encounters.create("Ambush", null, "prepared");
    areas.setEncounters(area.id, 1, [a.id]);
    encounters.remove(a.id);
    expect(areas.encounterIds(area.id)).toEqual([a.id]);
    // Re-saving the same list is allowed; the missing battle is not "new".
    expect(areas.setEncounters(area.id, 2, [a.id])).toMatchObject({ version: 3 });
    expect(areas.setEncounters(area.id, 3, [])).toMatchObject({ version: 4 });
    expect(areas.encounterIds(area.id)).toEqual([]);
  });

  it("moves a battle's rewards to the whole area when the battle is unlinked", () => {
    const { areas, encounters, area } = setup();
    const a = encounters.create("Ambush", null, "prepared");
    const b = encounters.create("Boss", null, "prepared");
    areas.setEncounters(area.id, 1, [a.id, b.id]);
    areas.setRewards(area.id, 2, [item({ encounterId: a.id }), item({ encounterId: b.id })]);
    areas.setEncounters(area.id, 3, [b.id]);
    expect(areas.rewards(area.id).map((reward) => reward.encounterId)).toEqual([null, b.id]);
  });
});

describe("rewards", () => {
  it("stores item and pointer rewards in order and reads them back", () => {
    const { areas, area } = setup();
    areas.setRewards(area.id, 1, [
      pointer({ npcRef: { source: "custom", id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f" } }),
      item({ quantity: 3, note: "in the chest" }),
    ]);
    const rewards = areas.rewards(area.id);
    expect(rewards.map((reward) => reward.kind)).toEqual(["pointer", "item"]);
    expect(rewards[1]).toMatchObject({ quantity: 3, note: "in the chest", status: "planned" });
    expect(rewards[0]).toMatchObject({ title: "The village owes you", npcRef: { source: "custom" } });
  });

  it("keeps the identity of a reward that is sent back and ignores foreign or repeated ids", () => {
    const { areas, area } = setup();
    const other = areas.create({ name: "Other", summary: "", notes: "" })!;
    areas.setRewards(other.id, 1, [item()]);
    const foreignId = areas.rewards(other.id)[0].id;

    areas.setRewards(area.id, 1, [item(), item({ note: "second" })]);
    const [first, second] = areas.rewards(area.id);

    areas.setRewards(area.id, 2, [{ ...first }, { ...second, id: first.id }, item({ id: foreignId })]);
    const after = areas.rewards(area.id);
    expect(after[0].id).toBe(first.id);
    // The repeated id and the other area's id both got fresh ids.
    expect(new Set(after.map((reward) => reward.id)).size).toBe(3);
    expect(after[1].id).not.toBe(first.id);
    expect(after[2].id).not.toBe(foreignId);
    expect(areas.rewards(other.id)[0].id).toBe(foreignId);
  });

  it("refuses a reward tied to a battle that is not linked", () => {
    const { areas, encounters, area } = setup();
    const stray = encounters.create("Elsewhere", null, "prepared");
    expect(areas.setRewards(area.id, 1, [item({ encounterId: stray.id })])).toBe("bad_battle");
    expect(areas.rewards(area.id)).toEqual([]);
    expect(areas.get(area.id)?.version).toBe(1);
  });

  it("refuses a stale version without changing anything", () => {
    const { areas, area } = setup();
    areas.setRewards(area.id, 1, [item()]);
    expect(areas.setRewards(area.id, 1, [])).toBe("conflict");
    expect(areas.rewards(area.id)).toHaveLength(1);
  });

  it("ticks a status without touching the version, and only within the kind", () => {
    const { areas, area } = setup();
    areas.setRewards(area.id, 1, [item(), pointer()]);
    const [gear, favour] = areas.rewards(area.id);
    const version = areas.get(area.id)!.version;

    expect(areas.setRewardStatus(area.id, gear.id, "given")).toMatchObject({ status: "given" });
    expect(areas.setRewardStatus(area.id, favour.id, "earned")).toMatchObject({ status: "earned" });
    expect(areas.setRewardStatus(area.id, gear.id, "earned")).toBe("wrong_kind");
    expect(areas.setRewardStatus(area.id, favour.id, "skipped")).toBe("wrong_kind");
    expect(areas.setRewardStatus(area.id, gear.id, "nonsense")).toBeNull();
    expect(areas.setRewardStatus(area.id, "00000000-0000-4000-8000-000000000000", "given")).toBeNull();
    expect(areas.get(area.id)!.version).toBe(version);
  });

  it("does not tick a reward through another area", () => {
    const { areas, area } = setup();
    const other = areas.create({ name: "Other", summary: "", notes: "" })!;
    areas.setRewards(area.id, 1, [item()]);
    const [reward] = areas.rewards(area.id);
    expect(areas.setRewardStatus(other.id, reward.id, "given")).toBeNull();
    expect(areas.rewards(area.id)[0].status).toBe("planned");
  });

  it("counts progress on the list: given items and earned pointers", () => {
    const { areas, area } = setup();
    areas.setRewards(area.id, 1, [item(), item(), pointer(), pointer()]);
    const [a, , c] = areas.rewards(area.id);
    areas.setRewardStatus(area.id, a.id, "given");
    areas.setRewardStatus(area.id, c.id, "lost");
    expect(areas.list()[0]).toMatchObject({ rewardsTotal: 4, rewardsDone: 1 });
  });

  it("removes links and rewards with the area", () => {
    const { db, areas, encounters, area } = setup();
    const a = encounters.create("Ambush", null, "prepared");
    areas.setEncounters(area.id, 1, [a.id]);
    areas.setRewards(area.id, 2, [item()]);
    areas.remove(area.id);
    expect((db.prepare("SELECT COUNT(*) AS n FROM area_encounters").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS n FROM area_rewards").get() as { n: number }).n).toBe(0);
    // The encounter it pointed at is untouched.
    expect(encounters.get(a.id)).not.toBeNull();
  });

  it("skips a stored reward whose data was damaged", () => {
    const { db, areas, area } = setup();
    areas.setRewards(area.id, 1, [item(), pointer()]);
    const [first] = areas.rewards(area.id);
    db.prepare("UPDATE area_rewards SET data = ? WHERE id = ?").run('{"quantity":0}', first.id);
    expect(areas.rewards(area.id).map((reward) => reward.kind)).toEqual(["pointer"]);
    db.prepare("UPDATE area_rewards SET data = ? WHERE id = ?").run("not json", first.id);
    expect(areas.rewards(area.id)).toHaveLength(1);
  });

  it("enforces the status/kind pairing in the database too", () => {
    const { db, area } = setup();
    const insert = db.prepare("INSERT INTO area_rewards (id, area_id, kind, status, position, data) VALUES ('r1', ?, ?, ?, 0, '{}')");
    expect(() => insert.run(area.id, "item", "earned")).toThrow();
    expect(() => insert.run(area.id, "pointer", "given")).toThrow();
  });

  it("records the item a reward names, so it can be found later", () => {
    const { db, areas, area } = setup();
    areas.setRewards(area.id, 1, [item(), pointer()]);
    const keys = db.prepare("SELECT ref_key FROM area_rewards ORDER BY position").all() as { ref_key: string | null }[];
    expect(keys.map((row) => row.ref_key)).toEqual(["srd:2014/longsword", null]);
  });
});

describe("reward schema", () => {
  it("refuses stray fields, mixed kinds, bad quantities and bad refs", () => {
    expect(rewardInputSchema.safeParse({ ...item(), extra: 1 }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...item(), status: "earned" }).success).toBe(false);
    expect(rewardInputSchema.safeParse({ ...pointer(), status: "given" }).success).toBe(false);
    expect(rewardInputSchema.safeParse(item({ quantity: 0 })).success).toBe(false);
    expect(rewardInputSchema.safeParse(item({ quantity: 1.5 })).success).toBe(false);
    expect(rewardInputSchema.safeParse(item({ itemRef: { source: "srd", edition: "1999" as never, slug: "x" } })).success).toBe(false);
    expect(rewardInputSchema.safeParse(item({ itemRef: { source: "srd", edition: "2014", slug: "../x" } })).success).toBe(false);
    expect(rewardInputSchema.safeParse(pointer({ title: " " })).success).toBe(false);
    expect(rewardInputSchema.safeParse({ kind: "gold", amount: 5 }).success).toBe(false);
  });
});

describe("upgrading an existing database", () => {
  it("adds items and areas to a database at the previous schema without touching its data", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const { migrate } = await import("@/lib/dm/db");
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    // Version 8 is the last one before items and areas.
    migrate(db, 8);
    db.prepare("INSERT INTO creatures (id, kind, name, data, created_at, updated_at) VALUES ('c1', 'npc', 'Mayor', '{}', 'x', 'x')").run();
    db.prepare("INSERT INTO encounters (id, name, version, data, created_at, updated_at, kind) VALUES ('e1', 'Ambush', 1, '{}', 'x', 'x', 'prepared')").run();

    migrate(db);

    expect(db.prepare("SELECT name FROM creatures").all()).toEqual([{ name: "Mayor" }]);
    expect(db.prepare("SELECT name FROM encounters").all()).toEqual([{ name: "Ambush" }]);
    for (const table of ["items", "areas", "area_encounters", "area_rewards"]) {
      expect(() => db.prepare(`SELECT COUNT(*) FROM ${table}`).get()).not.toThrow();
    }
    // Running it again does nothing.
    expect(() => migrate(db)).not.toThrow();
  });
});
