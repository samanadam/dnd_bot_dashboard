import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { env } from "@/lib/env";
import { openDatabase } from "./db";

let shared: DatabaseSync | null = null;

/** The portal's one database connection, opened on first use. */
export function getDatabase(): DatabaseSync {
  shared ??= openDatabase(`${env().PORTAL_DATA_DIR}/portal.db`);
  return shared;
}
