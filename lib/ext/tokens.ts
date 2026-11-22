import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

// Bearer tokens for the browser extension. Only a sha256 of a token is stored,
// so a leaked database cannot be replayed; a token reaches /api/ext/* only.

export const MAX_TOKENS_PER_USER = 5;

export type ExtTokenInfo = { id: string; label: string; campaignId: string; createdAt: string; lastUsedAt: string | null };

type Row = { id: string; user_id: string; campaign_id: string; label: string; created_at: string; last_used_at: string | null };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export class ExtTokenRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  issue(userId: string, campaignId: string, label: string): { id: string; token: string } {
    const mine = Number((this.db.prepare("SELECT COUNT(*) AS n FROM ext_tokens WHERE user_id = ?").get(userId) as { n: number }).n);
    if (mine >= MAX_TOKENS_PER_USER) throw new Error("too many tokens");
    const id = randomUUID();
    const token = `ptx_${randomBytes(32).toString("base64url")}`;
    this.db
      .prepare("INSERT INTO ext_tokens (id, user_id, campaign_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, campaignId, label, hash(token), this.now().toISOString());
    return { id, token };
  }

  /** The owner and campaign a token belongs to (and marks it used), or null. */
  verify(token: string): { id: string; userId: string; campaignId: string } | null {
    if (!token.startsWith("ptx_")) return null;
    const row = this.db.prepare("SELECT id, user_id, campaign_id FROM ext_tokens WHERE token_hash = ?").get(hash(token)) as Pick<Row, "id" | "user_id" | "campaign_id"> | undefined;
    if (!row) return null;
    this.db.prepare("UPDATE ext_tokens SET last_used_at = ? WHERE id = ?").run(this.now().toISOString(), row.id);
    return { id: row.id, userId: row.user_id, campaignId: row.campaign_id };
  }

  list(userId: string): ExtTokenInfo[] {
    const rows = this.db.prepare("SELECT id, user_id, campaign_id, label, created_at, last_used_at FROM ext_tokens WHERE user_id = ? ORDER BY created_at").all(userId) as Row[];
    return rows.map((r) => ({ id: r.id, label: r.label, campaignId: r.campaign_id, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
  }

  revoke(userId: string, id: string): boolean {
    return Number(this.db.prepare("DELETE FROM ext_tokens WHERE id = ? AND user_id = ?").run(id, userId).changes) === 1;
  }
}
