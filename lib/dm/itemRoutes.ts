import { parseSelectionStrict } from "@/lib/campaign/selection";
import { errorResponse } from "@/lib/requestGuard";
import type { Edition } from "./srd";
import { guardDm, invalidBody, readDmJson, type DmGuardDeps } from "./guard";
import { json, noContent, type AuditLog } from "./http";
import { customItemSchema, ITEM_ID, MAX_CUSTOM_ITEMS, type ItemBlock, type ItemRepo } from "./items";
import type { SrdItemSummary } from "./srdItems";

// Handlers for /api/dm/items (the DM's own items), /api/dm/items/search (SRD and
// custom together, for the item browser and the reward picker) and
// /api/dm/items/srd/:edition/:slug (one bundled SRD item).

/** The bundled SRD items, injected so the handlers stay testable without the data files. */
export type SrdItems = { list: () => SrdItemSummary[]; get: (edition: Edition, slug: string) => ItemBlock | null };

export type ItemRouteDeps = DmGuardDeps & { items: () => ItemRepo; srdItems: () => SrdItems; log?: AuditLog };

const missing = () => errorResponse(404, "not_found", "No such item.");

export type ItemSearchResult = {
  ref: { source: "srd"; edition: Edition; slug: string } | { source: "custom"; id: string };
  name: string;
  category: string;
  rarity: string;
  attunement: boolean;
};

const SEARCH_SOURCES = ["all", "custom", "2014", "2024"] as const;
const MAX_PAGE = 60;

const fold = (text: string) => text.toLocaleLowerCase("en");

export function itemCollection(deps: ItemRouteDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const campaign = parseSelectionStrict(new URL(request.url).searchParams.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      return json(deps.items().list(campaign.selection));
    },

    async POST(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = customItemSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const created = deps.items().create(parsed.data);
      if (!created) return errorResponse(409, "conflict", `That is the most items you can keep (${MAX_CUSTOM_ITEMS}). Delete one first.`);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "POST", path: "dm/items", status: 201 });
      return json(created, 201);
    },
  };
}

export function itemItem(deps: ItemRouteDeps) {
  return {
    async GET(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const item = ITEM_ID.test(id) ? deps.items().get(id) : null;
      return item ? json(item) : missing();
    },

    async PUT(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!ITEM_ID.test(id)) return missing();
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = customItemSchema.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const updated = deps.items().update(id, parsed.data);
      if (!updated) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "dm/items/:id", status: 200 });
      return json(updated);
    },

    async DELETE(request: Request, id: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      if (!ITEM_ID.test(id) || !deps.items().remove(id)) return missing();
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "DELETE", path: "dm/items/:id", status: 204 });
      return noContent();
    },
  };
}

export function itemSearch(deps: ItemRouteDeps) {
  return {
    /** ?q= text, ?source= all|custom|2014|2024, ?category=, ?campaign=, ?offset=, ?limit= (at most 60). */
    async GET(request: Request): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const params = new URL(request.url).searchParams;
      const campaign = parseSelectionStrict(params.get("campaign"));
      if (!campaign.ok) return errorResponse(400, "bad_request", "Invalid campaign.");
      const source = (params.get("source") ?? "all") as (typeof SEARCH_SOURCES)[number];
      if (!SEARCH_SOURCES.includes(source)) return errorResponse(400, "bad_request", "Invalid source.");
      const q = fold((params.get("q") ?? "").trim().slice(0, 80));
      const category = fold((params.get("category") ?? "").trim().slice(0, 60));
      const offset = Math.max(0, Math.min(100_000, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
      const limit = Math.max(1, Math.min(MAX_PAGE, Number.parseInt(params.get("limit") ?? "40", 10) || 40));

      const all: ItemSearchResult[] = [];
      if (source === "all" || source === "custom") {
        for (const item of deps.items().list(campaign.selection)) {
          all.push({ ref: { source: "custom", id: item.id }, name: item.name, category: item.category, rarity: item.rarity, attunement: item.attunement !== "" });
        }
      }
      if (source !== "custom") {
        for (const item of deps.srdItems().list()) {
          if (source === "all" || item.edition === source) {
            all.push({ ref: { source: "srd", edition: item.edition, slug: item.slug }, name: item.name, category: item.category, rarity: item.rarity, attunement: item.attunement });
          }
        }
      }
      const matches = all.filter((item) => (!q || fold(item.name).includes(q)) && (!category || fold(item.category) === category));
      const categories = [...new Set(all.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      return json({ total: matches.length, results: matches.slice(offset, offset + limit), categories });
    },
  };
}

export function srdItem(deps: ItemRouteDeps) {
  return {
    async GET(request: Request, edition: string, slug: string): Promise<Response> {
      const guard = await guardDm(request, deps);
      if (!guard.ok) return guard.response;
      const block = edition === "2014" || edition === "2024" ? deps.srdItems().get(edition, slug) : null;
      if (!block) return missing();
      // Static data behind a login: the browser may keep it, shared caches may not.
      return Response.json(block, { headers: { "Cache-Control": "private, max-age=3600" } });
    },
  };
}
