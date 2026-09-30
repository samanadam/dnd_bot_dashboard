"use client";

import { z } from "zod";
import { campaignIdSchema, parseSelectionStrict, type Selection } from "@/lib/campaign/selection";
import { areaEncountersSchema, areaOrderSchema, areaSchema, areaUpdateSchema, type Area, type AreaSummary } from "@/lib/dm/areas";
import type { AreaDetail, BattleView, RewardView } from "@/lib/dm/areaView";
import { ConflictError, DmError } from "@/lib/dm/client";
import { creatureInputSchema, creatureKindSchema, type Creature } from "@/lib/dm/creatures";
import type { CreatureSearchResult } from "@/lib/dm/creatureSearch";
import { encounterSchema, launchCopy, newEncounter, type CreatureRef } from "@/lib/dm/encounter";
import type { EncounterSummary, StoredEncounter } from "@/lib/dm/encounters";
import type { ItemSearchResult } from "@/lib/dm/itemRoutes";
import { customItemSchema, type CustomItem, type ItemRef } from "@/lib/dm/items";
import { DONE_STATUSES, rewardListSchema, rewardStatusBodySchema, type Reward } from "@/lib/dm/rewards";
import { savedSchema, type SavedTrack } from "@/lib/dm/saved";
import { sceneSchema, type Scene } from "@/lib/dm/scenes";
import { setTagsSchema } from "@/lib/dm/tags";
import type { DemoState } from "./fixtures";
import { DEMO_SRD_ITEMS, DEMO_SRD_MONSTERS } from "./srdSample";
import { readDemo, updateDemo } from "./store";

// The DM API, played by the browser. Bodies go through the same zod schemas the
// real routes use and answers have the same shapes, but everything lives in this
// tab's memory and is gone on reload.

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Route = { method: Method; pattern: RegExp; run: (params: string[], body: unknown, query: URLSearchParams) => unknown };

const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

const fail = (status: number, code: string, message: string): never => {
  throw new DmError(status, code, message);
};

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  return fail(400, "bad_request", `Invalid ${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
}

function selection(query: URLSearchParams): Selection {
  const parsed = parseSelectionStrict(query.get("campaign"));
  return parsed.ok ? parsed.selection : fail(400, "bad_request", "Invalid campaign.");
}

const inScope = (campaignId: string | null, scope: Selection) => scope === null || (scope === "unassigned" ? campaignId === null : campaignId === scope);
const fold = (text: string) => text.toLocaleLowerCase("en");
const now = () => new Date().toISOString();

// --- lookups ----------------------------------------------------------------

function itemName(state: DemoState, ref: ItemRef) {
  if (ref.source === "custom") {
    const item = state.dm.items.find((i) => i.id === ref.id);
    return item ? { name: item.name, category: item.category, rarity: item.rarity } : null;
  }
  const item = DEMO_SRD_ITEMS.find((i) => i.edition === ref.edition && i.slug === ref.slug)?.item;
  return item ? { name: item.name, category: item.category, rarity: item.rarity } : null;
}

function creatureName(state: DemoState, ref: CreatureRef) {
  if (ref.source === "custom") {
    const creature = state.dm.creatures.find((c) => c.id === ref.id);
    return creature ? { name: creature.statBlock.name } : null;
  }
  const monster = DEMO_SRD_MONSTERS.find((m) => m.edition === ref.edition && m.slug === ref.slug);
  return monster ? { name: monster.statBlock.name } : null;
}

export function areaSummaries(state: DemoState, scope: Selection): AreaSummary[] {
  return state.dm.areas
    .filter((area) => inScope(area.campaignId, scope))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((area) => {
      const rewards = state.dm.areaRewards[area.id] ?? [];
      return {
        id: area.id,
        name: area.name,
        summary: area.summary,
        campaignId: area.campaignId,
        position: area.position,
        updatedAt: area.updatedAt,
        battles: (state.dm.areaBattles[area.id] ?? []).length,
        rewardsTotal: rewards.length,
        rewardsDone: rewards.filter((r) => DONE_STATUSES.includes(r.status)).length,
      };
    });
}

export function areaDetailOf(state: DemoState, area: Area): AreaDetail {
  const battles = (state.dm.areaBattles[area.id] ?? []).map((id): BattleView => {
    const stored = state.dm.encounters.find((e) => e.id === id);
    return { id, name: stored?.encounter.name ?? null, combatants: stored?.encounter.combatants.length ?? 0, prepared: stored?.kind === "prepared" };
  });
  const rewards = (state.dm.areaRewards[area.id] ?? []).map((reward): RewardView => {
    if (reward.kind === "item") return { ...reward, resolved: itemName(state, reward.itemRef) };
    if (reward.npcRef) return { ...reward, resolved: creatureName(state, reward.npcRef) };
    return reward;
  });
  return { area, battles, rewards };
}

export function encounterSummaries(state: DemoState, scope: Selection): EncounterSummary[] {
  return state.dm.encounters
    .filter((e) => inScope(e.campaignId, scope))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((e) => ({
      id: e.id,
      name: e.encounter.name,
      round: e.encounter.round,
      combatants: e.encounter.combatants.length,
      campaignId: e.campaignId,
      kind: e.kind,
      updatedAt: e.updatedAt,
    }));
}

function findArea(state: DemoState, id: string): Area {
  return state.dm.areas.find((a) => a.id === id) ?? fail(404, "not_found", "No such area.");
}

function bumpArea(state: DemoState, id: string, version: number): Area {
  const area = findArea(state, id);
  if (area.version !== version) fail(409, "conflict", "This area was changed somewhere else. Reload it and try again.");
  area.version += 1;
  area.updatedAt = now();
  return area;
}

function findEncounter(state: DemoState, id: string): StoredEncounter {
  return state.dm.encounters.find((e) => e.id === id) ?? fail(404, "not_found", "No such encounter.");
}

function createEncounter(state: DemoState, name: string, campaignId: string | null, kind: StoredEncounter["kind"]): StoredEncounter {
  const stored: StoredEncounter = { id: crypto.randomUUID(), version: 1, encounter: encounterSchema.parse(newEncounter(name)), campaignId, kind, updatedAt: now() };
  state.dm.encounters.push(stored);
  return stored;
}

// --- routes -----------------------------------------------------------------

const createEncounterSchema = z
  .object({ name: z.string().trim().min(1).max(80), campaignId: campaignIdSchema.nullable().optional(), kind: z.enum(["live", "prepared"]).optional() })
  .strict();
const saveEncounterSchema = z.object({ version: z.number().int().min(1), encounter: encounterSchema }).strict();
const encounterCampaignSchema = z.object({ campaignId: campaignIdSchema.nullable() }).strict();

const routes: Route[] = [
  // creatures
  {
    method: "GET",
    pattern: /^creatures$/,
    run: (_p, _b, query) => {
      const kind = query.get("kind");
      const wanted = kind === null ? undefined : parse(creatureKindSchema, kind);
      const scope = selection(query);
      return readDemo().dm.creatures.filter((c) => (!wanted || c.kind === wanted) && inScope(c.campaignId, scope));
    },
  },
  {
    method: "GET",
    pattern: /^creatures\/search$/,
    run: (_p, _b, query) => {
      const state = readDemo();
      const scope = selection(query);
      const q = fold((query.get("q") ?? "").trim().slice(0, 80));
      const mine: CreatureSearchResult[] = state.dm.creatures
        .filter((c) => c.kind === "monster" || inScope(c.campaignId, scope))
        .map((c) => ({ ref: { source: "custom", id: c.id }, name: c.statBlock.name, kind: c.kind, detail: c.kind === "npc" ? "Your NPC" : "Your monster" }));
      const srd: CreatureSearchResult[] = DEMO_SRD_MONSTERS.map((m) => ({
        ref: { source: "srd", edition: m.edition, slug: m.slug },
        name: m.statBlock.name,
        kind: "monster",
        detail: `SRD ${m.edition} · CR ${m.statBlock.cr}`,
      }));
      return { results: [...mine, ...srd].filter((entry) => !q || fold(entry.name).includes(q)).slice(0, 30) };
    },
  },
  {
    method: "POST",
    pattern: /^creatures$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const input = parse(creatureInputSchema, body);
        const { campaignId, ...rest } = input;
        const at = now();
        const created: Creature = { id: crypto.randomUUID(), ...rest, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
        state.dm.creatures.push(created);
        return created;
      }),
  },
  { method: "GET", pattern: new RegExp(`^creatures/${ID}$`), run: ([id]) => readDemo().dm.creatures.find((c) => c.id === id) ?? fail(404, "not_found", "No such creature.") },
  {
    method: "PUT",
    pattern: new RegExp(`^creatures/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const input = parse(creatureInputSchema, body);
        const creature = state.dm.creatures.find((c) => c.id === id) ?? fail(404, "not_found", "No such creature.");
        const { campaignId, ...rest } = input;
        Object.assign(creature, rest, campaignId === undefined ? {} : { campaignId }, { updatedAt: now() });
        return creature;
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^creatures/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        if (!state.dm.creatures.some((c) => c.id === id)) fail(404, "not_found", "No such creature.");
        state.dm.creatures = state.dm.creatures.filter((c) => c.id !== id);
      }),
  },
  {
    method: "GET",
    pattern: /^srd\/(2014|2024)\/([a-z0-9-]{1,80})$/,
    run: ([edition, slug]) => DEMO_SRD_MONSTERS.find((m) => m.edition === edition && m.slug === slug)?.statBlock ?? fail(404, "not_found", "No such monster in the demo."),
  },

  // encounters
  { method: "GET", pattern: /^encounters$/, run: (_p, _b, query) => encounterSummaries(readDemo(), selection(query)) },
  {
    method: "POST",
    pattern: /^encounters$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const input = parse(createEncounterSchema, body);
        return createEncounter(state, input.name, input.campaignId ?? null, input.kind ?? "live");
      }),
  },
  { method: "GET", pattern: new RegExp(`^encounters/${ID}$`), run: ([id]) => findEncounter(readDemo(), id) },
  {
    method: "PUT",
    pattern: new RegExp(`^encounters/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const input = parse(saveEncounterSchema, body);
        const stored = findEncounter(state, id);
        if (stored.version !== input.version) throw new ConflictError(structuredClone(stored));
        Object.assign(stored, { version: stored.version + 1, encounter: input.encounter, updatedAt: now() });
        return stored;
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^encounters/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        findEncounter(state, id);
        state.dm.encounters = state.dm.encounters.filter((e) => e.id !== id);
      }),
  },
  {
    method: "POST",
    pattern: new RegExp(`^encounters/${ID}/launch$`),
    run: ([id]) =>
      updateDemo((state) => {
        const template = findEncounter(state, id);
        if (template.kind !== "prepared") fail(409, "conflict", "Only a prepared encounter can be launched.");
        const copy = createEncounter(state, template.encounter.name, template.campaignId, "live");
        Object.assign(copy, { version: 2, encounter: launchCopy(template.encounter) });
        return copy;
      }),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^encounters/${ID}/campaign$`),
    run: ([id], body) =>
      updateDemo((state) => {
        findEncounter(state, id).campaignId = parse(encounterCampaignSchema, body).campaignId;
      }),
  },

  // scenes
  { method: "GET", pattern: /^scenes$/, run: (_p, _b, query) => sortScenes(readDemo().dm.scenes.filter((s) => inScope(s.campaignId, selection(query)))) },
  {
    method: "POST",
    pattern: /^scenes$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(sceneSchema, body);
        const at = now();
        const scene: Scene = { id: crypto.randomUUID(), ...input, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
        state.dm.scenes.push(scene);
        return scene;
      }),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^scenes/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(sceneSchema, body);
        const scene = state.dm.scenes.find((s) => s.id === id) ?? fail(404, "not_found", "No such scene.");
        Object.assign(scene, input, campaignId === undefined ? {} : { campaignId }, { updatedAt: now() });
        return scene;
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^scenes/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        if (!state.dm.scenes.some((s) => s.id === id)) fail(404, "not_found", "No such scene.");
        state.dm.scenes = state.dm.scenes.filter((s) => s.id !== id);
      }),
  },

  // saved links
  {
    method: "GET",
    pattern: /^saved$/,
    run: (_p, _b, query) =>
      readDemo()
        .dm.saved.filter((s) => inScope(s.campaignId, selection(query)))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title)),
  },
  {
    method: "POST",
    pattern: /^saved$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(savedSchema, body);
        if (state.dm.saved.some((s) => s.source === input.source && s.kind === input.kind && s.ref === input.ref)) fail(409, "conflict", "That link is already saved in this list.");
        const at = now();
        const saved: SavedTrack = { id: crypto.randomUUID(), ...input, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
        state.dm.saved.push(saved);
        return saved;
      }),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^saved/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(savedSchema, body);
        const saved = state.dm.saved.find((s) => s.id === id) ?? fail(404, "not_found", "No such saved link.");
        Object.assign(saved, input, campaignId === undefined ? {} : { campaignId }, { updatedAt: now() });
        return saved;
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^saved/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        if (!state.dm.saved.some((s) => s.id === id)) fail(404, "not_found", "No such saved link.");
        state.dm.saved = state.dm.saved.filter((s) => s.id !== id);
        delete state.dm.tags[`saved:${id}`];
      }),
  },

  // tags
  { method: "GET", pattern: /^tags$/, run: () => readDemo().dm.tags },
  {
    method: "PUT",
    pattern: /^tags$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const { ref, tags } = parse(setTagsSchema, body);
        if (tags.length) state.dm.tags[ref] = tags;
        else delete state.dm.tags[ref];
        return { ref, tags };
      }),
  },

  // areas
  { method: "GET", pattern: /^areas$/, run: (_p, _b, query) => areaSummaries(readDemo(), selection(query)) },
  {
    method: "POST",
    pattern: /^areas$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const input = parse(areaSchema, body);
        const campaignId = input.campaignId ?? null;
        const siblings = state.dm.areas.filter((a) => a.campaignId === campaignId);
        const at = now();
        const area: Area = {
          id: crypto.randomUUID(),
          name: input.name,
          summary: input.summary,
          notes: input.notes,
          campaignId,
          position: siblings.reduce((max, a) => Math.max(max, a.position), -1) + 1,
          version: 1,
          createdAt: at,
          updatedAt: at,
        };
        state.dm.areas.push(area);
        state.dm.areaBattles[area.id] = [];
        state.dm.areaRewards[area.id] = [];
        return areaDetailOf(state, area);
      }),
  },
  {
    method: "PUT",
    pattern: /^areas\/order$/,
    run: (_p, body) =>
      updateDemo((state) => {
        parse(areaOrderSchema, body).ids.forEach((id, index) => {
          const area = state.dm.areas.find((a) => a.id === id);
          if (area) area.position = index;
        });
      }),
  },
  { method: "GET", pattern: new RegExp(`^areas/${ID}$`), run: ([id]) => areaDetailOf(readDemo(), findArea(readDemo(), id)) },
  {
    method: "PUT",
    pattern: new RegExp(`^areas/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const { version, ...input } = parse(areaUpdateSchema, body);
        const area = bumpArea(state, id, version);
        Object.assign(area, { name: input.name, summary: input.summary, notes: input.notes }, input.campaignId === undefined ? {} : { campaignId: input.campaignId });
        return areaDetailOf(state, area);
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^areas/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        findArea(state, id);
        state.dm.areas = state.dm.areas.filter((a) => a.id !== id);
        delete state.dm.areaBattles[id];
        delete state.dm.areaRewards[id];
      }),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^areas/${ID}/encounters$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const input = parse(areaEncountersSchema, body);
        const unique = [...new Set(input.encounterIds)];
        const linked = new Set(state.dm.areaBattles[id] ?? []);
        const prepared = (eid: string) => state.dm.encounters.some((e) => e.id === eid && e.kind === "prepared");
        findArea(state, id);
        if (unique.some((eid) => !linked.has(eid) && !prepared(eid))) fail(400, "bad_request", "Only prepared encounters can be linked to an area.");
        const area = bumpArea(state, id, input.version);
        state.dm.areaBattles[id] = unique;
        for (const reward of state.dm.areaRewards[id] ?? []) if (reward.encounterId && !unique.includes(reward.encounterId)) reward.encounterId = null;
        return areaDetailOf(state, area);
      }),
  },
  {
    method: "PUT",
    pattern: new RegExp(`^areas/${ID}/rewards$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const input = parse(rewardListSchema, body);
        const linked = new Set(state.dm.areaBattles[id] ?? []);
        findArea(state, id);
        if (input.rewards.some((r) => r.encounterId !== null && !linked.has(r.encounterId))) fail(400, "bad_request", "A reward names a battle that is not linked to this area.");
        const area = bumpArea(state, id, input.version);
        const existing = new Set((state.dm.areaRewards[id] ?? []).map((r) => r.id));
        const used = new Set<string>();
        state.dm.areaRewards[id] = input.rewards.map((reward): Reward => {
          const rewardId = reward.id && existing.has(reward.id) && !used.has(reward.id) ? reward.id : crypto.randomUUID();
          used.add(rewardId);
          return { ...reward, id: rewardId };
        });
        return areaDetailOf(state, area);
      }),
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^areas/${ID}/rewards/${ID}$`),
    run: ([id, rewardId], body) =>
      updateDemo((state) => {
        const { status } = parse(rewardStatusBodySchema, body);
        const area = findArea(state, id);
        const reward = (state.dm.areaRewards[id] ?? []).find((r) => r.id === rewardId) ?? fail(404, "not_found", "No such reward.");
        const allowed = reward.kind === "item" ? ["planned", "given", "skipped"] : ["pending", "earned", "lost"];
        if (!allowed.includes(status)) fail(400, "bad_request", "That status does not fit this kind of reward.");
        reward.status = status as never;
        return areaDetailOf(state, area);
      }),
  },

  // items
  {
    method: "GET",
    pattern: /^items\/search$/,
    run: (_p, _b, query) => {
      const state = readDemo();
      const scope = selection(query);
      const source = query.get("source") ?? "all";
      if (!["all", "custom", "2014", "2024"].includes(source)) fail(400, "bad_request", "Invalid source.");
      const q = fold((query.get("q") ?? "").trim().slice(0, 80));
      const category = fold((query.get("category") ?? "").trim().slice(0, 60));
      const offset = Math.max(0, Number.parseInt(query.get("offset") ?? "0", 10) || 0);
      const limit = Math.max(1, Math.min(60, Number.parseInt(query.get("limit") ?? "40", 10) || 40));
      const all: ItemSearchResult[] = [];
      if (source === "all" || source === "custom") {
        for (const item of state.dm.items.filter((i) => inScope(i.campaignId, scope)).sort((a, b) => a.name.localeCompare(b.name))) {
          all.push({ ref: { source: "custom", id: item.id }, name: item.name, category: item.category, rarity: item.rarity, attunement: item.attunement !== "" });
        }
      }
      if (source !== "custom") {
        for (const { edition, slug, item } of DEMO_SRD_ITEMS) {
          if (source === "all" || edition === source) {
            all.push({ ref: { source: "srd", edition, slug }, name: item.name, category: item.category, rarity: item.rarity, attunement: item.attunement !== "" });
          }
        }
      }
      const matches = all.filter((item) => (!q || fold(item.name).includes(q)) && (!category || fold(item.category) === category));
      const categories = [...new Set(all.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return { total: matches.length, results: matches.slice(offset, offset + limit), categories };
    },
  },
  {
    method: "GET",
    pattern: /^items\/srd\/(2014|2024)\/([a-z0-9-]{1,80})$/,
    run: ([edition, slug]) => DEMO_SRD_ITEMS.find((i) => i.edition === edition && i.slug === slug)?.item ?? fail(404, "not_found", "No such item."),
  },
  { method: "GET", pattern: /^items$/, run: (_p, _b, query) => readDemo().dm.items.filter((i) => inScope(i.campaignId, selection(query))) },
  {
    method: "POST",
    pattern: /^items$/,
    run: (_p, body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(customItemSchema, body);
        const at = now();
        const item: CustomItem = { id: crypto.randomUUID(), ...input, campaignId: campaignId ?? null, createdAt: at, updatedAt: at };
        state.dm.items.push(item);
        return item;
      }),
  },
  { method: "GET", pattern: new RegExp(`^items/${ID}$`), run: ([id]) => readDemo().dm.items.find((i) => i.id === id) ?? fail(404, "not_found", "No such item.") },
  {
    method: "PUT",
    pattern: new RegExp(`^items/${ID}$`),
    run: ([id], body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(customItemSchema, body);
        const item = state.dm.items.find((i) => i.id === id) ?? fail(404, "not_found", "No such item.");
        Object.assign(item, input, campaignId === undefined ? {} : { campaignId }, { updatedAt: now() });
        return item;
      }),
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^items/${ID}$`),
    run: ([id]) =>
      updateDemo((state) => {
        if (!state.dm.items.some((i) => i.id === id)) fail(404, "not_found", "No such item.");
        state.dm.items = state.dm.items.filter((i) => i.id !== id);
      }),
  },
];

function sortScenes(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Answers one DM client call from the demo store. */
export async function demoDmCall<T>(method: Method, path: string, body?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const url = new URL(path, "https://demo.invalid/");
  const route = url.pathname.slice(1);
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = candidate.pattern.exec(route);
    if (!match) continue;
    const result = candidate.run(match.slice(1), body ?? {}, url.searchParams);
    // A copy, so nothing a component does to the answer can reach the store.
    return (result === undefined ? undefined : structuredClone(result)) as T;
  }
  return fail(404, "not_found", "The demo does not do that.");
}
