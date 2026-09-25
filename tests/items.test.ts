import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { customItemSchema, ItemRepo, MAX_CUSTOM_ITEMS, refKey, type CustomItemInput } from "@/lib/dm/items";
import { isSrdItemDocument, itemSlug, normaliseOpen5eItem } from "@/lib/dm/openItems";

const CAMPAIGN = "0123456789ab";
const OTHER = "ba9876543210";

const sword: CustomItemInput = {
  name: "Moonblade",
  category: "Weapon",
  rarity: "Rare",
  attunement: "Required",
  costGp: 0,
  weightLb: 3,
  detail: "1d8 radiant",
  description: "Glows near the undead.",
};

describe("custom items", () => {
  it("stores, reads back, updates and deletes an item", () => {
    const repo = new ItemRepo(openDatabase(":memory:"));
    const created = repo.create({ ...sword, campaignId: CAMPAIGN })!;
    expect(created).toMatchObject({ name: "Moonblade", campaignId: CAMPAIGN });
    expect(repo.get(created.id)).toEqual(created);

    // Left out, the campaign is unchanged; null clears it.
    expect(repo.update(created.id, { ...sword, name: "Moonblade +1" })?.campaignId).toBe(CAMPAIGN);
    expect(repo.update(created.id, { ...sword, campaignId: null })?.campaignId).toBeNull();
    expect(repo.remove(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.remove(created.id)).toBe(false);
  });

  it("filters the list by campaign selection", () => {
    const repo = new ItemRepo(openDatabase(":memory:"));
    repo.create({ ...sword, name: "A", campaignId: CAMPAIGN });
    repo.create({ ...sword, name: "B", campaignId: OTHER });
    repo.create({ ...sword, name: "C", campaignId: null });
    expect(repo.list().map((item) => item.name)).toEqual(["A", "B", "C"]);
    expect(repo.list(CAMPAIGN).map((item) => item.name)).toEqual(["A"]);
    expect(repo.list("unassigned").map((item) => item.name)).toEqual(["C"]);
  });

  it("refuses a malformed id without touching the database", () => {
    const repo = new ItemRepo(openDatabase(":memory:"));
    expect(repo.get("1 OR 1=1")).toBeNull();
    expect(repo.update("nope", sword)).toBeNull();
    expect(repo.remove("nope")).toBe(false);
  });

  it("stops at the item limit", () => {
    const db = openDatabase(":memory:");
    const repo = new ItemRepo(db);
    const insert = db.prepare("INSERT INTO items (id, name, campaign_id, data, created_at, updated_at) VALUES (?, 'x', NULL, '{}', '', '')");
    for (let index = 0; index < MAX_CUSTOM_ITEMS; index++) insert.run(`id-${index}`);
    expect(repo.create(sword)).toBeNull();
  });

  it("does not return a stored item whose data was damaged", () => {
    const db = openDatabase(":memory:");
    const repo = new ItemRepo(db);
    const created = repo.create(sword)!;
    db.prepare("UPDATE items SET data = ? WHERE id = ?").run('{"rarity":5}', created.id);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.list()).toEqual([]);
    db.prepare("UPDATE items SET data = ? WHERE id = ?").run("not json", created.id);
    expect(repo.get(created.id)).toBeNull();
  });

  it("refuses stray fields, bad campaigns and out-of-range values", () => {
    expect(customItemSchema.safeParse({ ...sword, extra: 1 }).success).toBe(false);
    expect(customItemSchema.safeParse({ ...sword, campaignId: "nope" }).success).toBe(false);
    expect(customItemSchema.safeParse({ ...sword, name: "  " }).success).toBe(false);
    expect(customItemSchema.safeParse({ ...sword, costGp: -1 }).success).toBe(false);
    expect(customItemSchema.safeParse({ ...sword, description: "x".repeat(20_001) }).success).toBe(false);
  });

  it("builds one stable key per reference", () => {
    expect(refKey({ source: "srd", edition: "2014", slug: "longsword" })).toBe("srd:2014/longsword");
    expect(refKey({ source: "custom", id: "abc" })).toBe("custom:abc");
  });
});

describe("Open5e item conversion", () => {
  const raw = {
    key: "srd-2024_battleaxe",
    name: "Battleaxe",
    desc: "A heavy axe.",
    category: { name: "Weapon", key: "weapon" },
    cost: "10.00",
    weight: "4.000",
    weight_unit: "lb",
    weapon: {
      damage_dice: "1d8",
      damage_type: { name: "Slashing" },
      properties: [{ property: { name: "Versatile" }, detail: "1d10" }, { property: { name: "Topple" }, detail: null }],
    },
    armor: null,
    document: { key: "srd-2024" },
  };

  it("converts a weapon and describes its damage and properties", () => {
    expect(normaliseOpen5eItem(raw)).toEqual({
      name: "Battleaxe",
      category: "Weapon",
      rarity: "",
      attunement: "",
      costGp: 10,
      weightLb: 4,
      detail: "1d8 slashing · Versatile (1d10), Topple",
      description: "A heavy axe.",
    });
  });

  it("converts a magic item with attunement", () => {
    const item = normaliseOpen5eItem({
      key: "srd_ring",
      name: "Ring of Protection",
      desc: "+1 AC.",
      category: { name: "Ring" },
      rarity: { name: "Rare" },
      cost: null,
      weight: null,
      requires_attunement: true,
      attunement_detail: "by a spellcaster",
      document: { key: "srd-2014" },
    });
    expect(item).toMatchObject({ rarity: "Rare", attunement: "by a spellcaster", costGp: 0, weightLb: 0 });
  });

  it("refuses an unexpected weight unit and a shape it does not know", () => {
    expect(() => normaliseOpen5eItem({ ...raw, weight_unit: "kg" })).toThrow();
    expect(() => normaliseOpen5eItem({ key: 5 })).toThrow();
  });

  it("only allows the two SRD documents", () => {
    expect(isSrdItemDocument("srd-2014")).toBe(true);
    expect(isSrdItemDocument("srd-2024")).toBe(true);
    expect(isSrdItemDocument("vom")).toBe(false);
    expect(isSrdItemDocument("__proto__")).toBe(false);
    expect(isSrdItemDocument(undefined)).toBe(false);
  });

  it("takes the slug from the key", () => {
    expect(itemSlug("srd-2024_battleaxe")).toBe("battleaxe");
    expect(itemSlug("srd_ring-of-protection")).toBe("ring-of-protection");
  });
});

describe("bundled SRD items", () => {
  for (const edition of ["2014", "2024"] as const) {
    const file = JSON.parse(readFileSync(`data/srd/items-${edition}.json`, "utf8")) as {
      edition: string;
      source: string;
      license: string;
      items: Array<{ slug: string; item: Record<string, unknown> }>;
    };

    it(`items-${edition}.json is SRD only, valid and free of duplicates`, () => {
      expect(file).toMatchObject({ edition, source: `srd-${edition}`, license: "CC-BY-4.0" });
      expect(file.items.length).toBeGreaterThan(300);
      const slugs = new Set<string>();
      for (const { slug, item } of file.items) {
        expect(slug).toMatch(/^[a-z0-9-]{1,80}$/);
        expect(slugs.has(slug)).toBe(false);
        slugs.add(slug);
        const parsed = customItemSchema.safeParse(item);
        expect(parsed.success, `${slug}`).toBe(true);
      }
    });

    it(`items-${edition}.json carries nothing from another book`, () => {
      const text = readFileSync(`data/srd/items-${edition}.json`, "utf8");
      expect(text).not.toMatch(/vault of magic|kobold press/i);
    });
  }
});
