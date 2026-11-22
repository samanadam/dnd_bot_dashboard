// Bundles the browser extension into extension/dist (load that folder unpacked in Chrome or Edge).
// The portal's own code (the dice scene, skins) is bundled in, so the extension and the portal share it.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

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
});

copyFileSync("extension/manifest.json", `${out}/manifest.json`);
copyFileSync("extension/src/popup.html", `${out}/popup.html`);
