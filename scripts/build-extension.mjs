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
// STORE_PORTAL=https://your.portal builds the store version: it may only ask for that one site,
// instead of any https site (which store review would question).
if (process.env.STORE_PORTAL) {
  const origin = new URL(process.env.STORE_PORTAL).origin;
  manifest.optional_host_permissions = [`${origin}/*`];
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
copyFileSync("extension/src/popup.html", `${out}/popup.html`);
cpSync("extension/icons", `${out}/icons`, { recursive: true, filter: (src) => !src.endsWith(".svg") });
