"use client";

import { useQuery } from "@tanstack/react-query";
import { inDemo } from "@/lib/demo/base";
import { DmError } from "@/lib/dm/client";
import type { GrantInput, StoredGrant } from "./grants";
import { fromSummary, type Access, type AccessSummary } from "./permissions";
import type { GrantsView } from "./routes";

// Browser client for /api/access. Same conventions as the DM client: portal
// header, same-origin credentials, no caching; the demo answers from memory.

async function call<T>(method: "GET" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  if (inDemo()) return (await import("@/lib/demo/accessTransport")).demoAccessCall<T>(method, path, body);
  let response: Response;
  try {
    response = await fetch(`/api/access/${path}`, {
      method,
      headers: { "x-portal-request": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new DmError(0, "network_error", "Cannot reach the portal. Check your connection.");
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new DmError(response.status, error?.code ?? "error", error?.message ?? "Something went wrong.");
  }
  return data as T;
}

export const accessApi = {
  me: () => call<AccessSummary>("GET", "me"),
  grants: () => call<GrantsView>("GET", "grants"),
  putGrant: (roleId: string, input: GrantInput) => call<StoredGrant>("PUT", `grants/${encodeURIComponent(roleId)}`, input),
  deleteGrant: (roleId: string) => call<void>("DELETE", `grants/${encodeURIComponent(roleId)}`),
};

export const ACCESS_KEY = ["access"] as const;

/** The signed-in user's own access, for showing and hiding controls. Never a gate. */
export function useMyAccess(): Access | null {
  const query = useQuery({ queryKey: [...ACCESS_KEY, "me"], queryFn: accessApi.me, staleTime: 60_000 });
  return query.data ? fromSummary("me", query.data) : null;
}
