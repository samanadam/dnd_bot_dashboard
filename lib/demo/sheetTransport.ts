"use client";

import { z } from "zod";
import { secureRng } from "@/lib/dice/random";
import { DiceError, naturalD20, rollDice, withAdvantage } from "@/lib/dice/roll";
import { DmError } from "@/lib/dm/client";
import { customSpellSchema, type CustomSpell } from "@/lib/dm/spells";
import { featRow, parseFeatQuery, parseSpellQuery, searchFeats, searchSpells, spellRow, srdFeatRow, srdSpellRow } from "@/lib/dm/spellSearch";
import { sheetView, summaryOf, type SheetView } from "@/lib/sheets/access";
import { newBody, sheetBodySchema } from "@/lib/sheets/body";
import { derive } from "@/lib/sheets/derive";
import { applyOps, opBatchSchema } from "@/lib/sheets/ops";
import type { StoredSheet } from "@/lib/sheets/repo";
import { newVitals } from "@/lib/sheets/vitals";
import { resolveAccess } from "@/lib/access/permissions";
import { DEMO_USER } from "./fixtures";
import { DEMO_SRD_FEATS, DEMO_SRD_SPELLS } from "./srdSpellSample";
import { readDemo, updateDemo } from "./store";

// The sheet API, played by the browser for the public demo. Same schemas and
// the same pure rules as the server; everything lives in this tab.

const access = () => resolveAccess(DEMO_USER.id, [], [DEMO_USER.id], []);
const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const NAME = "Demo DM";

function fail(status: number, code: string, message: string): never {
  throw new DmError(status, code, message);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) fail(400, "bad_request", `Invalid ${result.error.issues[0]?.path.join(".") || "body"}.`);
  return result.data;
}

function find(id: string): StoredSheet {
  return readDemo().play.sheets.find((s) => s.id === id) ?? fail(404, "not_found", "No such sheet.");
}

const view = (sheet: StoredSheet): SheetView => sheetView(sheet, access(), NAME);

function spellFacts(slug: string, edition: string) {
  const found = DEMO_SRD_SPELLS.find((s) => s.edition === edition && s.slug === slug)?.spell;
  return found ?? null;
}

type Handler = (match: string[], body: unknown, query: URLSearchParams) => unknown;
const routes: Array<[string, RegExp, Handler]> = [
  ["GET", /^sheets$/, (_m, _b, q) => readDemo().play.sheets.filter((s) => s.campaignId === q.get("campaign")).map((s) => summaryOf(s, DEMO_USER.id, NAME))],
  [
    "POST",
    /^sheets$/,
    (_m, body) =>
      updateDemo((state) => {
        const input = parse(z.object({ campaignId: z.string(), name: z.string().trim().min(1).max(120), edition: z.enum(["2014", "2024"]), ownerUserId: z.string().nullable().optional() }), body);
        const at = new Date().toISOString();
        const draft = newBody(input.name);
        const sheet: StoredSheet = {
          id: crypto.randomUUID(),
          campaignId: input.campaignId,
          ownerUserId: DEMO_USER.id,
          name: draft.identity.name,
          edition: input.edition,
          status: "active",
          active: !state.play.sheets.some((s) => s.campaignId === input.campaignId && s.active),
          version: 1,
          body: draft,
          vitalsVersion: 1,
          vitals: newVitals(derive(draft, newVitals(1), input.edition).maxHp),
          dmNotes: "",
          portrait: null,
          nameSync: "ok",
          createdAt: at,
          updatedAt: at,
        };
        state.play.sheets.push(sheet);
        return view(sheet);
      }),
  ],
  ["GET", /^sheets\/players$/, () => [{ userId: DEMO_USER.id, name: NAME }]],
  ["GET", new RegExp(`^sheets/${ID}$`), ([id]) => view(find(id))],
  [
    "PUT",
    new RegExp(`^sheets/${ID}$`),
    ([id], body) =>
      updateDemo((state) => {
        const input = parse(z.object({ version: z.number(), body: sheetBodySchema, edition: z.enum(["2014", "2024"]).optional() }), body);
        const sheet = state.play.sheets.find((s) => s.id === id) ?? fail(404, "not_found", "No such sheet.");
        Object.assign(sheet, { body: input.body, name: input.body.identity.name, version: sheet.version + 1, edition: input.edition ?? sheet.edition });
        return view(sheet);
      }),
  ],
  [
    "DELETE",
    new RegExp(`^sheets/${ID}$`),
    ([id]) =>
      updateDemo((state) => {
        state.play.sheets = state.play.sheets.filter((s) => s.id !== id);
      }),
  ],
  [
    "GET",
    new RegExp(`^sheets/${ID}/vitals$`),
    ([id], _b, q) => {
      const sheet = find(id);
      return Number(q.get("since")) >= sheet.vitalsVersion ? undefined : { vitalsVersion: sheet.vitalsVersion, vitals: sheet.vitals, version: sheet.version };
    },
  ],
  [
    "POST",
    new RegExp(`^sheets/${ID}/ops$`),
    ([id], body) =>
      updateDemo((state) => {
        const { ops } = parse(opBatchSchema, body);
        const sheet = state.play.sheets.find((s) => s.id === id) ?? fail(404, "not_found", "No such sheet.");
        const applied = applyOps(sheet.vitals, ops, {
          body: sheet.body,
          edition: sheet.edition,
          rng: secureRng,
          spell: (ref) => {
            const block = ref.source === "srd" ? spellFacts(ref.slug, ref.edition) : null;
            return block ? { name: block.name, level: block.level, concentration: block.concentration, ritual: block.ritual } : null;
          },
        });
        if (!applied.ok) fail(422, "refused", applied.reason);
        sheet.vitals = applied.vitals;
        sheet.vitalsVersion += 1;
        return { vitalsVersion: sheet.vitalsVersion, vitals: sheet.vitals, results: applied.results };
      }),
  ],
  [
    "PATCH",
    new RegExp(`^sheets/${ID}/meta$`),
    ([id], body) =>
      updateDemo((state) => {
        const patch = parse(z.object({ ownerUserId: z.string().nullable().optional(), active: z.boolean().optional(), status: z.enum(["active", "retired", "dead"]).optional(), dmNotes: z.string().max(20_000).optional() }), body);
        const sheet = state.play.sheets.find((s) => s.id === id) ?? fail(404, "not_found", "No such sheet.");
        if (patch.active) for (const other of state.play.sheets) if (other.campaignId === sheet.campaignId) other.active = false;
        if (patch.active !== undefined) sheet.active = patch.active;
        if (patch.status) {
          sheet.status = patch.status;
          if (patch.status !== "active") sheet.active = false;
        }
        if (patch.dmNotes !== undefined) sheet.dmNotes = patch.dmNotes;
        return view(sheet);
      }),
  ],
  ["POST", new RegExp(`^sheets/${ID}/name-sync$`), () => ({ nameSync: "ok" })],
  [
    "POST",
    new RegExp(`^sheets/${ID}/roll$`),
    ([id], body) => {
      const input = parse(z.object({ expression: z.string().max(60), label: z.string().max(60), mode: z.enum(["normal", "advantage", "disadvantage"]), announce: z.boolean() }), body);
      find(id);
      try {
        const roll = rollDice(input.mode === "normal" ? input.expression : withAdvantage(input.expression, input.mode === "advantage" ? "adv" : "dis"));
        return { expression: roll.expression, total: roll.total, breakdown: roll.breakdown, label: input.mode === "normal" ? input.label : `${input.label} (${input.mode})`, announced: false, natural: naturalD20(roll) };
      } catch (error) {
        if (error instanceof DiceError) fail(400, "bad_request", error.message);
        throw error;
      }
    },
  ],
  [
    "GET",
    new RegExp(`^sheets/${ID}/resolve$`),
    (_m, _b, q) => {
      const spells: Record<string, unknown> = {};
      for (const key of (q.get("spells") ?? "").split(",").filter(Boolean)) {
        const srd = /^srd:(2014|2024)\/([a-z0-9-]+)$/.exec(key);
        const custom = /^custom:(.+)$/.exec(key);
        spells[key] = srd ? spellFacts(srd[2], srd[1]) : custom ? (readDemo().dm.spells.find((s) => s.id === custom[1]) ?? null) : null;
      }
      const feats: Record<string, unknown> = {};
      for (const key of (q.get("feats") ?? "").split(",").filter(Boolean)) {
        const srd = /^srd:(2014|2024)\/([a-z0-9-]+)$/.exec(key);
        feats[key] = srd ? (DEMO_SRD_FEATS.find((f) => f.edition === srd[1] && f.slug === srd[2])?.feat ?? null) : null;
      }
      return { spells, feats };
    },
  ],
  [
    "GET",
    new RegExp(`^sheets/${ID}/spells/search$`),
    ([id], _b, q) => {
      const sheet = find(id);
      const parsed = parseSpellQuery(q);
      if (!parsed.ok) return fail(400, "bad_request", parsed.message);
      const custom = readDemo().dm.spells.filter((s) => s.campaignId === sheet.campaignId).map(spellRow);
      const srd = DEMO_SRD_SPELLS.filter((s) => s.edition === sheet.edition).map(({ edition, slug, spell }) =>
        srdSpellRow({ edition, slug, name: spell.name, level: spell.level, school: spell.school, castingTime: spell.castingTime, concentration: spell.concentration, ritual: spell.ritual, classes: spell.classes }),
      );
      return searchSpells([...custom, ...srd], { ...parsed.query, source: "all" });
    },
  ],
  [
    "GET",
    new RegExp(`^sheets/${ID}/feats/search$`),
    ([id], _b, q) => {
      const sheet = find(id);
      const parsed = parseFeatQuery(q);
      if (!parsed.ok) return fail(400, "bad_request", parsed.message);
      const custom = readDemo().dm.feats.filter((f) => f.campaignId === sheet.campaignId).map(featRow);
      const srd = DEMO_SRD_FEATS.filter((f) => f.edition === sheet.edition).map(({ edition, slug, feat }) => srdFeatRow({ edition, slug, name: feat.name, category: feat.category, prerequisite: feat.prerequisite }));
      return searchFeats([...custom, ...srd], { ...parsed.query, source: "all" });
    },
  ],
  [
    "POST",
    /^play\/homebrew\/spells$/,
    (_m, body) =>
      updateDemo((state) => {
        const { campaignId, ...input } = parse(customSpellSchema.extend({ campaignId: z.string() }), body);
        const at = new Date().toISOString();
        const spell: CustomSpell = { id: crypto.randomUUID(), ...input, campaignId, authorUserId: DEMO_USER.id, shared: false, createdAt: at, updatedAt: at };
        state.dm.spells.push(spell);
        return spell;
      }),
  ],
  ["POST", new RegExp(`^sheets/${ID}/copy$`), () => fail(400, "bad_request", "Copying to another campaign is not part of the demo.")],
];

export async function demoSheetCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 60));
  const [route, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  for (const [m, pattern, run] of routes) {
    if (m !== method) continue;
    const match = pattern.exec(route);
    if (match) return run(match.slice(1), body, query) as T;
  }
  return fail(404, "not_found", "Unknown endpoint.");
}
