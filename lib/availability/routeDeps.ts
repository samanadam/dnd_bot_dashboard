import "server-only";
import { SettingsRepo, UserRepo } from "@/lib/access/grants";
import { getAccess } from "@/lib/access/server";
import { audit } from "@/lib/audit";
import { getDatabase } from "@/lib/dm/database";
import { configuredNotifier } from "./notify";
import { AvailabilityRepo } from "./repo";
import type { AvailabilityDeps } from "./routes";

export function availabilityDeps(): AvailabilityDeps {
  return {
    getAccess,
    repo: () => new AvailabilityRepo(getDatabase()),
    users: () => new UserRepo(getDatabase()).list(),
    settings: () => new SettingsRepo(getDatabase()),
    notify: configuredNotifier,
    log: audit,
  };
}
