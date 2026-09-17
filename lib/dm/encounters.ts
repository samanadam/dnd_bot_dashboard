import type { DatabaseSync } from "node:sqlite";
import { encounterSchema, newEncounter, type Encounter } from "./encounter";

export type StoredEncounter = { id: string; version: number; encounter: Encounter; updatedAt: string };
export type EncounterSummary = { id: string; name: string; round: number; combatants: number; updatedAt: string };

export const ENCOUNTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = { id: string; name: string; version: number; data: string; updated_at: string };

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
        ? { id: row.id, version: Number(row.version), encounter: parsed.data, updatedAt: row.updated_at }
        : null;
    } catch {
      return null;
    }
  }

  list(): EncounterSummary[] {
    const rows = this.db.prepare("SELECT * FROM encounters ORDER BY updated_at DESC, id").all() as Row[];
    return rows
      .map((row) => this.parse(row))
      .filter((stored): stored is StoredEncounter => stored !== null)
      .map((stored) => ({
        id: stored.id,
        name: stored.encounter.name,
        round: stored.encounter.round,
        combatants: stored.encounter.combatants.length,
        updatedAt: stored.updatedAt,
      }));
  }

  get(id: string): StoredEncounter | null {
    if (!ENCOUNTER_ID.test(id)) return null;
    return this.parse(this.db.prepare("SELECT * FROM encounters WHERE id = ?").get(id) as Row | undefined);
  }

  create(name: string): StoredEncounter {
    const encounter = encounterSchema.parse(newEncounter(name));
    const id = this.newId();
    const at = this.now().toISOString();
    this.db
      .prepare("INSERT INTO encounters (id, name, version, data, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)")
      .run(id, encounter.name, JSON.stringify(encounter), at, at);
    return { id, version: 1, encounter, updatedAt: at };
  }

  save(id: string, expectedVersion: number, input: Encounter): StoredEncounter | "conflict" | null {
    if (!ENCOUNTER_ID.test(id)) return null;
    const encounter = encounterSchema.parse(input);
    const at = this.now().toISOString();
    const result = this.db
      .prepare("UPDATE encounters SET name = ?, data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .run(encounter.name, JSON.stringify(encounter), at, id, expectedVersion);
    if (Number(result.changes) > 0) return { id, version: expectedVersion + 1, encounter, updatedAt: at };
    return this.get(id) ? "conflict" : null;
  }

  remove(id: string): boolean {
    if (!ENCOUNTER_ID.test(id)) return false;
    return Number(this.db.prepare("DELETE FROM encounters WHERE id = ?").run(id).changes) > 0;
  }
}
