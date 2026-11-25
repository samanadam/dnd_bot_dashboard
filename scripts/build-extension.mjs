// Bundles the browser extension into extension/dist (load that folder unpacked in Chrome or Edge).
// The portal's own code (the dice scene, skins) is bundled in, so the extension and the portal share it.
import { build } from "esbuild";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const out = "extension/dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: {
    background: "extension/src/background.ts",
    content: "extension/src/content.ts",
    page: "extension/src/page.ts",
    popup: "extension/src/popup.ts",
    options: "extension/src/options.ts",
    portal: "extension/src/portal.ts",
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome120",
  tsconfig: "tsconfig.json",
  legalComments: "none",
  logLevel: "info",
  // DIAG=1 turns on the console logging in extension/src/page.ts (never for a store build).
  // minifySyntax drops the `if (false)` branches, so a normal build holds none of that code.
  define: { DIAG: process.env.DIAG ? "true" : "false" },
  minifySyntax: true,
});

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
// The portal the extension pairs with in one click (its script runs on that site's pages).
// STORE_PORTAL=https://your.portal sets it, and builds the store version: no localhost and no
// optional access to other sites (which store review would question).
const DEFAULT_PORTAL = "https://dcdashboard.yangil.net/*";
if (process.env.STORE_PORTAL) {
  const site = `${new URL(process.env.STORE_PORTAL).origin}/*`;
  const swap = (list) => [...new Set(list.filter((m) => m !== "http://localhost/*").map((m) => (m === DEFAULT_PORTAL ? site : m)))];
  manifest.host_permissions = swap(manifest.host_permissions);
  manifest.optional_host_permissions = [];
  for (const script of manifest.content_scripts) if (script.js.includes("portal.js")) script.matches = swap(script.matches);
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
copyFileSync("extension/src/popup.html", `${out}/popup.html`);
copyFileSync("extension/src/options.html", `${out}/options.html`);
copyFileSync("extension/src/ui.css", `${out}/ui.css`);
cpSync("extension/icons", `${out}/icons`, { recursive: true, filter: (src) => !src.endsWith(".svg") });
