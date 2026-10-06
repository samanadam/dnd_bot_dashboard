"use client";

import { inDemo } from "@/lib/demo/base";
import { DmError } from "@/lib/dm/client";
import type { FeatBlock } from "@/lib/dm/feats";
import type { FeatSearchResult, SpellSearchResult } from "@/lib/dm/spellSearch";
import type { CustomSpell, CustomSpellInput, SpellBlock } from "@/lib/dm/spells";
import type { CustomFeat, CustomFeatInput } from "@/lib/dm/feats";
import type { SheetSummary, SheetView } from "./access";
import type { SheetBody } from "./body";
import type { Op, OpResult } from "./ops";
import type { Vitals } from "./vitals";

// Browser client for /api/sheets and /api/play. Portal header, same-origin
// credentials, no caching; the public demo answers from memory.

export class SheetConflictError extends DmError {
  constructor(readonly current: SheetView) {
    super(409, "conflict", "This sheet was changed somewhere else.");
    this.name = "SheetConflictError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function sheetCall<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (inDemo()) return (await import("@/lib/demo/sheetTransport")).demoSheetCall<T>(method, path, body);
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers: { "x-portal-request": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new DmError(0, "network_error", "Cannot reach the portal. Check your connection.");
  }
  if (response.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    throw new DmError(401, "unauthorized", "Session expired.");
  }
  if (response.status === 204 || response.status === 304) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 409 && data && typeof data === "object" && "current" in data) throw new SheetConflictError((data as { current: SheetView }).current);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new DmError(response.status, error?.code ?? "error", error?.message ?? "Something went wrong.");
  }
  return data as T;
}

const enc = encodeURIComponent;
const q = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
};

export type RollAnswer = { expression: string; total: number; breakdown: string; label: string; announced: boolean; natural: 20 | 1 | null };
export type Player = { userId: string; name: string };

export const sheets = {
  list: (campaign: string) => sheetCall<SheetSummary[]>("GET", `sheets?campaign=${enc(campaign)}`),
  create: (input: { campaignId: string; name: string; edition: "2014" | "2024"; ownerUserId?: string | null }) => sheetCall<SheetView>("POST", "sheets", input),
  get: (id: string) => sheetCall<SheetView>("GET", `sheets/${enc(id)}`),
  save: (id: string, version: number, body: SheetBody, edition?: "2014" | "2024") => sheetCall<SheetView>("PUT", `sheets/${enc(id)}`, { version, body, ...(edition ? { edition } : {}) }),
  remove: (id: string) => sheetCall<void>("DELETE", `sheets/${enc(id)}`),
  /** undefined when nothing changed since `since`. */
  vitals: (id: string, since: number) => sheetCall<{ vitalsVersion: number; vitals: Vitals; version: number } | undefined>("GET", `sheets/${enc(id)}/vitals?since=${since}`),
  ops: (id: string, ops: Op[]) => sheetCall<{ vitalsVersion: number; vitals: Vitals; results: OpResult[] }>("POST", `sheets/${enc(id)}/ops`, { ops }),
  meta: (id: string, patch: { ownerUserId?: string | null; active?: boolean; status?: "active" | "retired" | "dead"; dmNotes?: string }) =>
    sheetCall<SheetView>("PATCH", `sheets/${enc(id)}/meta`, patch),
  nameSync: (id: string) => sheetCall<{ nameSync: "ok" | "pending" }>("POST", `sheets/${enc(id)}/name-sync`),
  roll: (id: string, input: { expression: string; label: string; mode: "normal" | "advantage" | "disadvantage"; announce: boolean }) =>
    sheetCall<RollAnswer>("POST", `sheets/${enc(id)}/roll`, input),
  copy: (id: string, campaignId: string) => sheetCall<SheetView>("POST", `sheets/${enc(id)}/copy`, { campaignId }),
  resolve: (id: string, spells: string[], feats: string[]) =>
    sheetCall<{ spells: Record<string, SpellBlock | null>; feats: Record<string, FeatBlock | null> }>("GET", `sheets/${enc(id)}/resolve?${q({ spells: spells.join(","), feats: feats.join(",") })}`),
  searchSpells: (id: string, params: Record<string, string | number | undefined>) =>
    sheetCall<{ total: number; results: SpellSearchResult[]; classes: string[] }>("GET", `sheets/${enc(id)}/spells/search?${q(params)}`),
  searchFeats: (id: string, params: Record<string, string | number | undefined>) =>
    sheetCall<{ total: number; results: FeatSearchResult[]; categories: string[] }>("GET", `sheets/${enc(id)}/feats/search?${q(params)}`),
  players: (campaign: string) => sheetCall<Player[]>("GET", `sheets/players?campaign=${enc(campaign)}`),
  homebrewSpells: (campaign: string) => sheetCall<CustomSpell[]>("GET", `play/homebrew/spells?campaign=${enc(campaign)}`),
  createHomebrewSpell: (input: CustomSpellInput & { campaignId: string }) => sheetCall<CustomSpell>("POST", "play/homebrew/spells", input),
  createHomebrewFeat: (input: CustomFeatInput & { campaignId: string }) => sheetCall<CustomFeat>("POST", "play/homebrew/feats", input),
};

/** The text key a ref is known by in resolve answers: srd:2024/fireball or custom:<id>. */
export function refKeyOf(ref: { source: "srd"; edition: string; slug: string } | { source: "custom"; id: string }): string {
  return ref.source === "srd" ? `srd:${ref.edition}/${ref.slug}` : `custom:${ref.id}`;
}
