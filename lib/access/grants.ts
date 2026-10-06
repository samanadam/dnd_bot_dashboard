import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { CAMPAIGN_ID } from "@/lib/campaign/selection";
import { PERMISSIONS, PRESETS, type Grant } from "./permissions";

// Storage for role grants, the signed-in user list and small settings.

export const SNOWFLAKE = /^\d{17,20}$/;
export const MAX_GRANT_CAMPAIGNS = 50;

export const grantInputSchema = z
  .object({
    permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
    scope: z.union([z.literal("all"), z.array(z.string().regex(CAMPAIGN_ID, "invalid campaign id")).max(MAX_GRANT_CAMPAIGNS)]),
    // The role's name as the editor saw it, kept for display only.
    label: z.string().trim().max(100).optional(),
  })
  .strict();
export type GrantInput = z.infer<typeof grantInputSchema>;

export type StoredGrant = Grant & { label: string; updatedAt: string; updatedBy: string };

type GrantRow = { role_id: string; label: string; permissions: string; all_campaigns: number; updated_at: string; updated_by: string };

function parsePermissions(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export class GrantRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(): StoredGrant[] {
    const rows = this.db.prepare("SELECT * FROM role_grants ORDER BY label COLLATE NOCASE, role_id").all() as GrantRow[];
    const campaigns = this.db.prepare("SELECT role_id, campaign_id FROM role_grant_campaigns ORDER BY campaign_id").all() as { role_id: string; campaign_id: string }[];
    return rows.map((row) => ({
      roleId: row.role_id,
      label: row.label,
      permissions: parsePermissions(row.permissions),
      scope: row.all_campaigns === 1 ? "all" : campaigns.filter((c) => c.role_id === row.role_id).map((c) => c.campaign_id),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }

  get(roleId: string): StoredGrant | null {
    return this.list().find((grant) => grant.roleId === roleId) ?? null;
  }

  /** Create or replace one role's grant, atomically. */
  put(roleId: string, input: GrantInput, by: string): StoredGrant {
    if (!SNOWFLAKE.test(roleId)) throw new Error("invalid role id");
    const value = grantInputSchema.parse(input);
    const permissions = [...new Set(value.permissions)].sort();
    const at = this.now().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO role_grants (role_id, label, permissions, all_campaigns, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(role_id) DO UPDATE SET label = excluded.label, permissions = excluded.permissions,
             all_campaigns = excluded.all_campaigns, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .run(roleId, value.label ?? "", JSON.stringify(permissions), value.scope === "all" ? 1 : 0, at, by);
      this.db.prepare("DELETE FROM role_grant_campaigns WHERE role_id = ?").run(roleId);
      if (value.scope !== "all") {
        const insert = this.db.prepare("INSERT INTO role_grant_campaigns (role_id, campaign_id) VALUES (?, ?)");
        for (const campaignId of new Set(value.scope)) insert.run(roleId, campaignId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.get(roleId)!;
  }

  remove(roleId: string): boolean {
    if (!SNOWFLAKE.test(roleId)) return false;
    return Number(this.db.prepare("DELETE FROM role_grants WHERE role_id = ?").run(roleId).changes) > 0;
  }
}

export class SettingsRepo {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}

/**
 * First start on the role-permission build: every role that had access through
 * ALLOWED_ROLE_IDS keeps exactly that access as a "Bot operator" grant. Runs
 * once, in one transaction, so a crash leaves nothing half-done.
 */
export function seedGrants(db: DatabaseSync, allowedRoleIds: readonly string[], now: () => Date = () => new Date()): boolean {
  const settings = new SettingsRepo(db);
  if (settings.get("access_seeded") !== null) return false;
  const at = now().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    // Checked again inside the transaction: two processes may start at once.
    if (settings.get("access_seeded") !== null) {
      db.exec("ROLLBACK");
      return false;
    }
    const insert = db.prepare(
      "INSERT OR IGNORE INTO role_grants (role_id, label, permissions, all_campaigns, updated_at, updated_by) VALUES (?, '', ?, 1, ?, 'seed')",
    );
    for (const roleId of new Set(allowedRoleIds)) {
      if (SNOWFLAKE.test(roleId)) insert.run(roleId, JSON.stringify([...PRESETS.operator.permissions].sort()), at);
    }
    settings.set("access_seeded", at);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type PortalUser = { userId: string; displayName: string; avatarUrl: string | null; roleIds: string[]; firstSeen: string; lastSeen: string };

type UserRow = { user_id: string; display_name: string; avatar_url: string | null; role_ids: string; first_seen: string; last_seen: string };

const AVATAR = /^https:\/\/cdn\.discordapp\.com\/[A-Za-z0-9_./-]{1,200}(\?size=\d{1,4})?$/;

export class UserRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toUser(row: UserRow): PortalUser {
    return {
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      roleIds: parsePermissions(row.role_ids).filter((id) => SNOWFLAKE.test(id)),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    };
  }

  /** Remember a signed-in user. Names are display text only; avatars only from Discord's CDN. */
  upsert(userId: string, displayName: string | null | undefined, avatarUrl: string | null | undefined, roleIds: readonly string[]): void {
    if (!SNOWFLAKE.test(userId)) return;
    const name = (displayName ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 80) || "Discord user";
    const avatar = avatarUrl && AVATAR.test(avatarUrl) ? avatarUrl : null;
    const roles = JSON.stringify(roleIds.filter((id) => SNOWFLAKE.test(id)).slice(0, 250));
    const at = this.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO portal_users (user_id, display_name, avatar_url, role_ids, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, avatar_url = excluded.avatar_url,
           role_ids = excluded.role_ids, last_seen = excluded.last_seen`,
      )
      .run(userId, name, avatar, roles, at, at);
  }

  get(userId: string): PortalUser | null {
    if (!SNOWFLAKE.test(userId)) return null;
    const row = this.db.prepare("SELECT * FROM portal_users WHERE user_id = ?").get(userId) as UserRow | undefined;
    return row ? this.toUser(row) : null;
  }

  list(): PortalUser[] {
    return (this.db.prepare("SELECT * FROM portal_users ORDER BY display_name COLLATE NOCASE, user_id").all() as UserRow[]).map((row) => this.toUser(row));
  }
}
