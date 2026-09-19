import "server-only";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { CreatureRepo } from "./creatures";
import { getDatabase } from "./database";
import { EncounterRepo } from "./encounters";
import { SceneRepo } from "./scenes";

/** Production dependencies for the DM route handlers. */
export function dmDeps() {
  return {
    getUserId: async () => (await auth())?.user?.id || null,
    dmIds: env().DM_USER_IDS,
    repo: () => new CreatureRepo(getDatabase()),
    encounters: () => new EncounterRepo(getDatabase()),
    scenes: () => new SceneRepo(getDatabase()),
    log: audit,
  };
}
