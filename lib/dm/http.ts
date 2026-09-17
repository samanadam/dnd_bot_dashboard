import type { audit } from "@/lib/audit";

// Small response helpers shared by the DM route handlers.

export type AuditLog = (entry: Parameters<typeof audit>[0]) => void;

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}
