"use client";

import type { Creature, CreatureInput } from "./creatures";
import type { Encounter } from "./encounter";
import type { EncounterSummary, StoredEncounter } from "./encounters";
import type { SavedInput, SavedTrack } from "./saved";
import type { Scene, SceneInput } from "./scenes";
import type { StatBlock } from "./statblock";

// Browser client for /api/dm. Same conventions as lib/bot/client.ts: portal
// header on every call, same-origin credentials, no caching, and a 401 sends the
// user back to sign-in.

export class DmError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DmError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string } };

/** A save lost to a newer version; `current` is what the server holds now. */
export class ConflictError extends DmError {
  constructor(readonly current: StoredEncounter) {
    super(409, "conflict", "This encounter was changed somewhere else.");
    this.name = "ConflictError";
  }
}

export async function dmCall<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/dm/${path}`, {
      method,
      headers: {
        "x-portal-request": "1",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
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
  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (response.status === 409 && data && typeof data === "object" && "current" in data && (data as { current: unknown }).current) {
    throw new ConflictError((data as { current: StoredEncounter }).current);
  }
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new DmError(response.status, error?.code ?? "internal_error", error?.message ?? `Request failed (${response.status}).`);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const dm = {
  listCreatures: (kind?: "monster" | "npc") => dmCall<Creature[]>("GET", kind ? `creatures?kind=${kind}` : "creatures"),
  getCreature: (id: string) => dmCall<Creature>("GET", `creatures/${enc(id)}`),
  createCreature: (input: CreatureInput) => dmCall<Creature>("POST", "creatures", input),
  updateCreature: (id: string, input: CreatureInput) => dmCall<Creature>("PUT", `creatures/${enc(id)}`, input),
  deleteCreature: (id: string) => dmCall<void>("DELETE", `creatures/${enc(id)}`),
  getSrdBlock: (edition: "2014" | "2024", slug: string) => dmCall<StatBlock>("GET", `srd/${edition}/${enc(slug)}`),
  listEncounters: () => dmCall<EncounterSummary[]>("GET", "encounters"),
  createEncounter: (name: string, campaignId: string | null = null, kind: "live" | "prepared" = "live") =>
    dmCall<StoredEncounter>("POST", "encounters", { name, campaignId, kind }),
  launchEncounter: (id: string) => dmCall<StoredEncounter>("POST", `encounters/${enc(id)}/launch`),
  setEncounterCampaign: (id: string, campaignId: string | null) =>
    dmCall<void>("PUT", `encounters/${enc(id)}/campaign`, { campaignId }),
  getEncounter: (id: string) => dmCall<StoredEncounter>("GET", `encounters/${enc(id)}`),
  // Rejects with ConflictError when another tab saved first.
  saveEncounter: (id: string, version: number, encounter: Encounter) =>
    dmCall<StoredEncounter>("PUT", `encounters/${enc(id)}`, { version, encounter }),
  deleteEncounter: (id: string) => dmCall<void>("DELETE", `encounters/${enc(id)}`),
  listScenes: (campaign?: string) => dmCall<Scene[]>("GET", campaign ? `scenes?campaign=${enc(campaign)}` : "scenes"),
  createScene: (input: SceneInput) => dmCall<Scene>("POST", "scenes", input),
  updateScene: (id: string, input: SceneInput) => dmCall<Scene>("PUT", `scenes/${enc(id)}`, input),
  deleteScene: (id: string) => dmCall<void>("DELETE", `scenes/${enc(id)}`),
  listSaved: (campaign?: string) => dmCall<SavedTrack[]>("GET", campaign ? `saved?campaign=${enc(campaign)}` : "saved"),
  createSaved: (input: SavedInput) => dmCall<SavedTrack>("POST", "saved", input),
  updateSaved: (id: string, input: SavedInput) => dmCall<SavedTrack>("PUT", `saved/${enc(id)}`, input),
  deleteSaved: (id: string) => dmCall<void>("DELETE", `saved/${enc(id)}`),
};
