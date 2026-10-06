import "server-only";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { AreaRepo } from "./areas";
import type { RefLookup } from "./areaView";
import { CreatureRepo } from "./creatures";
import { getDatabase } from "./database";
import { EncounterRepo } from "./encounters";
import { FeatRepo } from "./feats";
import { ItemRepo } from "./items";
import { SavedRepo } from "./saved";
import { SceneRepo } from "./scenes";
import { SpellRepo } from "./spells";
import { getSrd, listSrd } from "./srd";
import { getSrdItem, listSrdItems } from "./srdItems";
import { getSrdFeat, getSrdSpell, listSrdFeats, listSrdSpells } from "./srdSpells";
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
    getAccess,
    repo: () => new CreatureRepo(getDatabase()),
    encounters: () => new EncounterRepo(getDatabase()),
    scenes: () => new SceneRepo(getDatabase()),
    saved: () => new SavedRepo(getDatabase()),
    tags: () => new TagRepo(getDatabase()),
    items: () => new ItemRepo(getDatabase()),
    areas: () => new AreaRepo(getDatabase()),
    srdItems: () => ({ list: listSrdItems, get: getSrdItem }),
    spells: () => new SpellRepo(getDatabase()),
    feats: () => new FeatRepo(getDatabase()),
    srdSpells: () => ({ list: listSrdSpells, get: getSrdSpell }),
    srdFeats: () => ({ list: listSrdFeats, get: getSrdFeat }),
    srdMonsters: listSrd,
    lookup: refLookup,
    log: audit,
  };
}
