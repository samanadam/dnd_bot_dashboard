import { env } from "@/lib/env";

// Liveness for container orchestrators. Public by design, so it reveals
// nothing: no bot state, no version, no reason when misconfigured (the reason
// is in the server log).

export const dynamic = "force-dynamic";

export function GET() {
  try {
    env();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid server configuration");
    return Response.json({ status: "misconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
