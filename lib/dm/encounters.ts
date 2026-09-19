import type { DatabaseSync } from "node:sqlite";
import { campaignClause, CAMPAIGN_ID, type Selection } from "@/lib/campaign/selection";
import { encounterSchema, launchCopy, newEncounter, type Encounter } from "./encounter";

export type EncounterKind = "live" | "prepared";

export type StoredEncounter = {
  id: string;
  version: number;
  encounter: Encounter;
  campaignId: string | null;
  kind: EncounterKind;
  updatedAt: string;
};
export type EncounterSummary = {
  id: string;
  name: string;
  round: number;
  combatants: number;
  campaignId: string | null;
  kind: EncounterKind;
  updatedAt: string;
};

export const ENCOUNTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  name: string;
  version: number;
  data: string;
  campaign_id: string | null;
  kind: EncounterKind;
  updated_at: string;
};

// Saves are optimistic: a write names the version it was based on, so a second
// tab cannot silently overwrite the first.
export class EncounterRepo {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private parse(row: Row | undefined): StoredEncounter | null {
    if (!row) return null;
    try {
      const parsed = encounterSchema.safeParse(JSON.parse(row.data));
      return parsed.success
        ? {
            id: row.id,
            version: Number(row.version),
            encounter: parsed.data,
            campaignId: row.campaign_id,
            kind: row.kind,
            updatedAt: row.updated_at,
          }
        : null;
    } catch {
      return null;
    }
  }

  list(campaign: Selection = null): EncounterSummary[] {
    const scope = campaignClause(campaign);
    const rows = this.db
      .prepare(`SELECT * FROM encounters${scope.sql ? ` WHERE ${scope.sql}` : ""} ORDER BY updated_at DESC, id`)
      .all(...scope.args) as Row[];
    return rows
      .map((row) => this.parse(row))
      .filter((stored): stored is StoredEncounter => stored !== null)
      .map((stored) => ({
        id: stored.id,
        name: stored.encounter.name,
        round: stored.encounter.round,
        combatants: stored.encounter.combatants.length,
        campaignId: stored.campaignId,
        kind: stored.kind,
        updatedAt: stored.updatedAt,
      }));
  }

  get(id: string): StoredEncounter | null {
    if (!ENCOUNTER_ID.test(id)) return null;
    return this.parse(this.db.prepare("SELECT * FROM encounters WHERE id = ?").get(id) as Row | undefined);
  }

  create(name: string, campaignId: string | null = null, kind: EncounterKind = "live"): StoredEncounter {
    const encounter = encounterSchema.parse(newEncounter(name));
    const id = this.newId();
    const at = this.now().toISOString();
    this.db
      .prepare("INSERT INTO encounters (id, name, version, data, campaign_id, kind, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)")
      .run(id, encounter.name, JSON.stringify(encounter), campaignId, kind, at, at);
    return { id, version: 1, encounter, campaignId, kind, updatedAt: at };
  }

  /**
   * Start a prepared encounter: store a fresh live copy and leave the template
   * as it is. Null when the id is unknown; "not_prepared" for a live encounter.
   */
  launch(id: string): StoredEncounter | "not_prepared" | null {
    const template = this.get(id);
    if (!template) return null;
    if (template.kind !== "prepared") return "not_prepared";
    const copy = this.create(template.encounter.name, template.campaignId, "live");
    const filled = this.save(copy.id, copy.version, launchCopy(template.encounter));
    return filled === "conflict" || filled === null ? null : filled;
  }

  /** File an encounter under a campaign (null: none). Does not touch its version. */
  setCampaign(id: string, campaignId: string | null): boolean {
    if (!ENCOUNTER_ID.test(id) || (campaignId !== null && !CAMPAIGN_ID.test(campaignId))) return false;
    return Number(this.db.prepare("UPDATE encounters SET campaign_id = ? WHERE id = ?").run(campaignId, id).changes) > 0;
  }

  save(id: string, expectedVersion: number, input: Encounter): StoredEncounter | "conflict" | null {
    if (!ENCOUNTER_ID.test(id)) return null;
    const encounter = encounterSchema.parse(input);
    const at = this.now().toISOString();
    const result = this.db
      .prepare("UPDATE encounters SET name = ?, data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .run(encounter.name, JSON.stringify(encounter), at, id, expectedVersion);
    if (Number(result.changes) > 0) {
      const stored = this.get(id);
      return {
        id,
        version: expectedVersion + 1,
        encounter,
        campaignId: stored?.campaignId ?? null,
        kind: stored?.kind ?? "live",
        updatedAt: at,
      };
    }
    return this.get(id) ? "conflict" : null;
  }

  remove(id: string): boolean {
    if (!ENCOUNTER_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM encounters WHERE id = ?").run(id).changes) > 0;
  }
}
