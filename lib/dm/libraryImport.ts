import type { CreatureRepo } from "./creatures";
import { convertMonsterPage } from "./ddbMonsters";
import { LibraryPageRepo, MAX_LIBRARY_BYTES } from "./libraryPages";
import type { Edition, MonsterSummary } from "./monsterSummary";

// Imports one captured book page: converts it, reconciles each monster with the
// bundled SRD (the book copy wins, the SRD twin is hidden, never deleted) and
// reports what happened to every stat block.

export class NoStatBlocks extends Error {
  constructor() {
    super("The page has no stat blocks.");
  }
}
export class LibraryFull extends Error {
  constructor() {
    super("The library is full.");
  }
}

export type Ledger = {
  received: number;
  created: number;
  updated: number;
  /** Imported monsters that hide an SRD entry (counted inside created and updated). */
  superseding: number;
  needsReview: Array<{ name: string; reason: string }>;
};

export type LibraryImportDeps = {
  creatures: CreatureRepo;
  pages: LibraryPageRepo;
  srd: () => MonsterSummary[];
  maxLibraryBytes?: number;
};

export type LibraryImportInput = { source: string; edition: Edition; page: string; html: string; dryRun: boolean };

/** Lowercase letters and digits only: how a book name is matched to an SRD name. */
export const nameKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function importMonsterPage(deps: LibraryImportDeps, input: LibraryImportInput): Ledger {
  const { blocks, issues, found } = convertMonsterPage(input.html);
  if (found === 0) throw new NoStatBlocks();
  if (!input.dryRun && deps.pages.totalBytes() + Buffer.byteLength(input.html) > (deps.maxLibraryBytes ?? MAX_LIBRARY_BYTES)) throw new LibraryFull();

  const srdByName = new Map<string, MonsterSummary[]>();
  for (const entry of deps.srd()) {
    if (entry.edition !== input.edition) continue;
    const key = nameKey(entry.name);
    srdByName.set(key, [...(srdByName.get(key) ?? []), entry]);
  }

  const ledger: Ledger = { received: found, created: 0, updated: 0, superseding: 0, needsReview: issues.map((i) => ({ name: i.name, reason: i.reason })) };
  for (const block of blocks) {
    const twins = srdByName.get(nameKey(block.name)) ?? [];
    if (twins.length > 1) {
      ledger.needsReview.push({ name: block.name, reason: "More than one bundled SRD monster has this name." });
      continue;
    }
    const supersedes = twins.length === 1 ? `${input.edition}/${twins[0].slug}` : null;
    const origin = { source: input.source, sourceKey: block.sourceKey, supersedes };
    const outcome = input.dryRun
      ? deps.creatures.hasImported(origin.source, origin.sourceKey) ? "updated" : "created"
      : deps.creatures.upsertImported({ kind: "monster", statBlock: block.statBlock, notes: "", tags: [], campaignId: null }, origin);
    ledger[outcome] += 1;
    if (supersedes) ledger.superseding += 1;
  }
  if (!input.dryRun) deps.pages.put(input.source, input.page, input.html);
  return ledger;
}
