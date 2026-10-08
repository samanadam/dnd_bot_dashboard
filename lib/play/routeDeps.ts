import "server-only";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { getDatabase } from "@/lib/dm/database";
import { FeatRepo } from "@/lib/dm/feats";
import { SpellRepo } from "@/lib/dm/spells";

export function homebrewDeps() {
  return { getAccess, spells: () => new SpellRepo(getDatabase()), feats: () => new FeatRepo(getDatabase()), log: audit };
}
