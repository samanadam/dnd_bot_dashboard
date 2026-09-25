import "server-only";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { AreaRepo } from "./areas";
import type { RefLookup } from "./areaView";
import { CreatureRepo } from "./creatures";
import { getDatabase } from "./database";
import { EncounterRepo } from "./encounters";
import { ItemRepo } from "./items";
import { SavedRepo } from "./saved";
import { SceneRepo } from "./scenes";
import { getSrd, listSrd } from "./srd";
import { getSrdItem, listSrdItems } from "./srdItems";
import { TagRepo } from "./tags";

/** Looks up the names behind the references a reward holds, in the database and the bundled SRD. */
export function refLookup(): RefLookup {
  const db = getDatabase();
  return {
    item: (ref) => {
      const block = ref.source === "srd" ? getSrdItem(ref.edition, ref.slug) : new ItemRepo(db).get(ref.id);
      return block ? { name: block.name, category: block.category, rarity: block.rarity } : null;
    },
    creature: (ref) => {
      const name = ref.source === "srd" ? getSrd(ref.edition, ref.slug)?.name : new CreatureRepo(db).get(ref.id)?.statBlock.name;
      return name ? { name } : null;
    },
  };
}

/** Production dependencies for the DM route handlers. */
export function dmDeps() {
  return {
    getUserId: async () => (await auth())?.user?.id || null,
    dmIds: env().DM_USER_IDS,
    repo: () => new CreatureRepo(getDatabase()),
    encounters: () => new EncounterRepo(getDatabase()),
    scenes: () => new SceneRepo(getDatabase()),
    saved: () => new SavedRepo(getDatabase()),
    tags: () => new TagRepo(getDatabase()),
    items: () => new ItemRepo(getDatabase()),
    areas: () => new AreaRepo(getDatabase()),
    srdItems: () => ({ list: listSrdItems, get: getSrdItem }),
    srdMonsters: listSrd,
    lookup: refLookup,
    log: audit,
  };
}
