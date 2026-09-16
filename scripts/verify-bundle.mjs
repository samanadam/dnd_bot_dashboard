// Fails if any server-side secret appears in files shipped to browsers.
// Run after `npm run build`, with the same environment the build used.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_KEYS = ["BOT_API_TOKEN", "AUTH_SECRET", "AUTH_DISCORD_SECRET", "DISCORD_CLIENT_SECRET", "BOT_API_URL"];
const secrets = SECRET_KEYS.map((key) => [key, process.env[key]]).filter(([, value]) => value && value.length >= 8);

if (secrets.length === 0) {
  console.error("verify-bundle: no secrets in the environment to look for. Load .env.local or the deploy env first.");
  process.exit(1);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let leaks = 0;
for (const root of [".next/static", "public"]) {
  if (!existsSync(root)) continue;
  for (const file of files(root)) {
    const content = readFileSync(file, "latin1");
    for (const [key, value] of secrets) {
      if (content.includes(value)) {
        console.error(`LEAK: ${key} found in ${file}`);
        leaks += 1;
      }
    }
  }
}

if (leaks) process.exit(1);
console.log(`verify-bundle: looked for ${secrets.map(([key]) => key).join(", ")}; no leaks.`);
