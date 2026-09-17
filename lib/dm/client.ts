"use client";

import type { Creature, CreatureInput } from "./creatures";
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
};
