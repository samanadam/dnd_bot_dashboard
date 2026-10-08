"use client";

import { grantInputSchema, type StoredGrant } from "@/lib/access/grants";
import { currentPersona, PERSONA_ACCESS } from "./persona";
import type { GrantsView, GuildRole } from "@/lib/access/routes";
import { DmError } from "@/lib/dm/client";

// The access API, played by the browser for the public demo. Made-up roles and
// campaigns; nothing is stored beyond this tab.

const ROLES: GuildRole[] = [
  { id: "100000000000000001", name: "Dungeon Master", color: 0xe5484d, position: 6 },
  { id: "100000000000000002", name: "Co-DM", color: 0xf5a524, position: 5 },
  { id: "100000000000000003", name: "Ember Party", color: 0x3e63dd, position: 4 },
  { id: "100000000000000004", name: "Frost Party", color: 0x12a594, position: 3 },
  { id: "100000000000000005", name: "Recorder Crew", color: 0x8e4ec6, position: 2 },
];
const CAMPAIGNS = [
  { id: "a1b2c3d4e5f6", name: "Embers of the Guild", archived: false },
  { id: "f6e5d4c3b2a1", name: "Frostmarch", archived: false },
];

const at = new Date(Date.now() - 3 * 86_400_000).toISOString();
let grants: StoredGrant[] = [
  { roleId: ROLES[2].id, label: ROLES[2].name, permissions: ["play"], scope: [CAMPAIGNS[0].id], updatedAt: at, updatedBy: "demo" },
  { roleId: ROLES[3].id, label: ROLES[3].name, permissions: ["play"], scope: [CAMPAIGNS[1].id], updatedAt: at, updatedBy: "demo" },
  { roleId: ROLES[4].id, label: ROLES[4].name, permissions: ["bot.music", "bot.recording", "bot.sessions", "bot.view"], scope: "all", updatedAt: at, updatedBy: "demo" },
];

function fail(status: number, code: string, message: string): never {
  throw new DmError(status, code, message);
}

export async function demoAccessCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (method === "GET" && path === "me") return PERSONA_ACCESS[currentPersona()] as T;
  // Only the owner edits access, as in the portal.
  if (currentPersona() !== "owner") return fail(404, "not_found", "Unknown endpoint.");
  if (method === "GET" && path === "grants") {
    const view: GrantsView = {
      grants,
      roles: ROLES,
      campaigns: CAMPAIGNS,
      holders: { [ROLES[2].id]: 4, [ROLES[3].id]: 3, [ROLES[4].id]: 2, [ROLES[1].id]: 1 },
      signedIn: 8,
    };
    return view as T;
  }
  const match = /^grants\/(\d{17,20})$/.exec(path);
  if (!match) return fail(404, "not_found", "Unknown endpoint.");
  const roleId = match[1];
  if (method === "DELETE") {
    if (!grants.some((g) => g.roleId === roleId)) fail(404, "not_found", "No such grant.");
    grants = grants.filter((g) => g.roleId !== roleId);
    return undefined as T;
  }
  if (method === "PUT") {
    const parsed = grantInputSchema.safeParse(body);
    if (!parsed.success) fail(400, "bad_request", "Invalid grant.");
    const role = ROLES.find((r) => r.id === roleId) ?? fail(400, "bad_request", "That role is not on the server.");
    const saved: StoredGrant = {
      roleId,
      label: role.name,
      permissions: [...new Set(parsed.data.permissions)].sort(),
      scope: parsed.data.scope === "all" ? "all" : [...new Set(parsed.data.scope)],
      updatedAt: new Date().toISOString(),
      updatedBy: "demo",
    };
    grants = [...grants.filter((g) => g.roleId !== roleId), saved];
    return saved as T;
  }
  return fail(404, "not_found", "Unknown endpoint.");
}
