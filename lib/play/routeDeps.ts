import "server-only";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { getDatabase } from "@/lib/dm/database";
import { FeatRepo } from "@/lib/dm/feats";
import { SpellRepo } from "@/lib/dm/spells";
import { TableRollRepo } from "./tableRolls";

export function homebrewDeps() {
  return { getAccess, spells: () => new SpellRepo(getDatabase()), feats: () => new FeatRepo(getDatabase()), log: audit };
}

export function rollFeedDeps() {
  return { getAccess, tableRolls: () => new TableRollRepo(getDatabase()) };
}
