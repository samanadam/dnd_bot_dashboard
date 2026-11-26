import type { Ledger } from "./libraryImport";

// The pure parts of scripts/import-ddb-pages.mts, kept here so they are tested.

export type CliArgs = { dir: string; source: string; edition: "2014" | "2024"; url: string; token: string; dryRun: boolean };

export function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i].startsWith("--")) flags.set(argv[i].slice(2), argv[++i] ?? "");
  }
  const need = (name: string) => {
    const value = flags.get(name);
    if (!value) throw new Error(`Missing --${name}`);
    return value;
  };
  const edition = need("edition");
  if (edition !== "2014" && edition !== "2024") throw new Error("--edition must be 2014 or 2024");
  const source = need("source");
  if (!/^ddb:[a-z0-9-]{1,40}$/.test(source)) throw new Error("--source must look like ddb:mm-2024");
  const url = need("url").replace(/\/+$/, "");
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error("--url must be https (or http on localhost)");
  return { dir: need("dir"), source, edition, url, token: need("token"), dryRun };
}

/** `mm-2024_monsters-a.html` is the page `monsters-a`. */
export const pageNameOf = (file: string): string => file.replace(/\.html$/, "").split("_").slice(1).join("_");

export function addLedgers(a: Ledger, b: Ledger): Ledger {
  return {
    received: a.received + b.received,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    superseding: a.superseding + b.superseding,
    needsReview: [...a.needsReview, ...b.needsReview],
  };
}

export function formatLedger(ledger: Ledger): string {
  const lines = [`received ${ledger.received}, created ${ledger.created}, updated ${ledger.updated}, replacing SRD ${ledger.superseding}, needs review ${ledger.needsReview.length}`];
  for (const item of ledger.needsReview) lines.push(`  needs review: ${item.name}: ${item.reason}`);
  return lines.join("\n");
}
