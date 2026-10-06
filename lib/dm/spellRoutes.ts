import { z } from "zod";
import { parseSelectionStrict, type Selection } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import { customFeatSchema, MAX_CUSTOM_FEATS, type CustomFeatInput, type FeatBlock, type FeatRepo } from "./feats";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { featRow, parseFeatQuery, parseSpellQuery, searchFeats, searchSpells, spellRow, srdFeatRow, srdSpellRow } from "./spellSearch";
import { customSpellSchema, MAX_CUSTOM_SPELLS, SPELL_ID, type CustomSpellInput, type SpellBlock, type SpellRepo } from "./spells";
import type { Edition } from "./srd";
import type { SrdFeatSummary, SrdSpellSummary } from "./srdSpells";

// Handlers for /api/dm/spells and /api/dm/feats: the DM's own (and players'
// homebrew), search over SRD and custom together, and one bundled SRD entry.

export type SrdSpells = { list: () => SrdSpellSummary[]; get: (edition: Edition, slug: string) => SpellBlock | null };
export type SrdFeats = { list: () => SrdFeatSummary[]; get: (edition: Edition, slug: string) => FeatBlock | null };

export type SpellRouteDeps = DmGuardDeps & {
  spells: () => SpellRepo;
  feats: () => FeatRepo;
  srdSpells: () => SrdSpells;
  srdFeats: () => SrdFeats;
  log?: AuditLog;
};

const shareSchema = z.object({ shared: z.boolean() }).strict();

type Kind = "spell" | "feat";

type Repo = {
  list: (selection: Selection) => unknown[];
  get: (id: string) => unknown;
  create: (input: never) => unknown;
  update: (id: string, input: never) => unknown;
  setShared: (id: string, shared: boolean) => unknown;
  remove: (id: string) => boolean;
};

function config(kind: Kind, deps: SpellRouteDeps) {
  return kind === "spell"
    ? { repo: deps.spells() as unknown as Repo, schema: customSpellSchema as z.ZodType<CustomSpellInput | CustomFeatInput>, limit: MAX_CUSTOM_SPELLS, path: "dm/spells", noun: "spell", plural: "spells" }
    : { repo: deps.feats() as unknown as Repo, schema: customFeatSchema as z.ZodType<CustomSpellInput | CustomFeatInput>, limit: MAX_CUSTOM_FEATS, path: "dm/feats", noun: "feat", plural: "feats" };
}

function collection(kind: Kind, deps: SpellRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      return json(config(kind, deps).repo.list(campaign.selection));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const c = config(kind, deps);
      const parsed = c.schema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = c.repo.create(parsed.data as never);
      if (!created) return errorResponse(409, "conflict", `That is the most ${c.plural} you can keep (${c.limit}). Delete one first.`);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: c.path, status: 201 });
      return json(created, 201);
    },
  };
}

function item(kind: Kind, deps: SpellRouteDeps) {
  const missing = () => errorResponse(404, "not_found", `No such ${kind}.`);
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const found = SPELL_ID.test(id) ? config(kind, deps).repo.get(id) : null;
      return found ? json(found) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SPELL_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const c = config(kind, deps);
      const parsed = c.schema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = c.repo.update(id, parsed.data as never);
      if (!updated) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: `${c.path}/:id`, status: 200 });
      return json(updated);
    },

    /** Body { shared }: share a player's homebrew with its campaign, or take it back. */
    async PATCH(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!SPELL_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = shareSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const c = config(kind, deps);
      const updated = c.repo.setShared(id, parsed.data.shared);
      if (!updated) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PATCH", path: `${c.path}/:id`, status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const c = config(kind, deps);
      if (!SPELL_ID.test(id) || !c.repo.remove(id)) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: `${c.path}/:id`, status: 204 });
      return noContent();
    },
  };
}

function srdOne(kind: Kind, deps: SpellRouteDeps) {
  return {
    async GET(request: Request, edition: string, slug: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const valid = edition === "2014" || edition === "2024";
      const block = valid ? (kind === "spell" ? deps.srdSpells().get(edition, slug) : deps.srdFeats().get(edition, slug)) : null;
      if (!block) return errorResponse(404, "not_found", `No such ${kind}.`);
      // Static data behind a login: the browser may keep it, shared caches may not.
      return Response.json(block, { headers: { "Cache-Control": "private, max-age=3600" } });
    },
  };
}

export const spellCollection = (deps: SpellRouteDeps) => collection("spell", deps);
export const spellItem = (deps: SpellRouteDeps) => item("spell", deps);
export const srdSpell = (deps: SpellRouteDeps) => srdOne("spell", deps);
export const featCollection = (deps: SpellRouteDeps) => collection("feat", deps);
export const featItem = (deps: SpellRouteDeps) => item("feat", deps);
export const srdFeat = (deps: SpellRouteDeps) => srdOne("feat", deps);

export function spellSearch(deps: SpellRouteDeps) {
  return {
    /** ?q= ?source= ?level=0,1 ?school= ?class= ?concentration= ?ritual= ?campaign= ?offset= ?limit= */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const params = new URL(request.url).searchParams;
      const campaign = parseSelectionStrict(params.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const query = parseSpellQuery(params);
      if (!query.ok) return errorResponse(400, "bad_request", query.message);
      const all = [...deps.spells().list(campaign.selection).map(spellRow), ...deps.srdSpells().list().map(srdSpellRow)];
      return json(searchSpells(all, query.query));
    },
  };
}

export function featSearch(deps: SpellRouteDeps) {
  return {
    /** ?q= ?source= ?category= ?campaign= ?offset= ?limit= */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const params = new URL(request.url).searchParams;
      const campaign = parseSelectionStrict(params.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const query = parseFeatQuery(params);
      if (!query.ok) return errorResponse(400, "bad_request", query.message);
      const all = [...deps.feats().list(campaign.selection).map(featRow), ...deps.srdFeats().list().map(srdFeatRow)];
      return json(searchFeats(all, query.query));
    },
  };
}
