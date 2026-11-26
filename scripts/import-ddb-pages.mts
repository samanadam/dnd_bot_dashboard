// Sends captured D&D Beyond book pages to the portal's book import.
// Reads only local files; it makes no request to D&D Beyond.
// Usage (dry run first, then the real run):
//   npx tsx@4.23.13 scripts/import-ddb-pages.mts --dir data-ignore/raw/monster-manuel-2024 \
//     --source ddb:mm-2024 --edition 2024 --url https://your-portal --token ptx_... [--dry-run]
// The token is a pairing token made in the portal by the DM account.
// Design: docs/superpowers/specs/2026-11-26-ddb-book-import-design.md
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addLedgers, formatLedger, pageNameOf, parseArgs } from "../lib/dm/libraryCli";
import type { Ledger } from "../lib/dm/libraryImport";

const args = parseArgs(process.argv.slice(2));
const files = readdirSync(args.dir).filter((f) => f.endsWith(".html")).sort();
if (files.length === 0) throw new Error(`No .html pages in ${args.dir}`);

let total: Ledger = { received: 0, created: 0, updated: 0, superseding: 0, needsReview: [] };
for (const file of files) {
  const response = await fetch(`${args.url}/api/ext/library/pages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${args.token}` },
    body: JSON.stringify({ source: args.source, edition: args.edition, page: pageNameOf(file), html: readFileSync(join(args.dir, file), "utf8"), dryRun: args.dryRun }),
  });
  if (!response.ok) {
    console.error(`${file}: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  const { ledger } = (await response.json()) as { ledger: Ledger };
  total = addLedgers(total, ledger);
  console.log(`${file}: ${formatLedger(ledger).split("\n")[0]}`);
}
console.log(`\n${args.dryRun ? "DRY RUN (nothing written)\n" : ""}${formatLedger(total)}`);
