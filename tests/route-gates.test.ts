import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every way into the portal must check who is asking. These tests read the
// source, so a new route or page cannot ship without a gate.

function files(dir: string, name: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path, name) : name.test(entry) ? [path] : [];
  });
}

const posix = (path: string) => path.split("\\").join("/");

// Routes that answer before sign-in on purpose, each for a reason.
const PUBLIC_ROUTES = new Set([
  "app/api/auth/[...nextauth]/route.ts", // the sign-in flow itself
  "app/api/health/route.ts", // liveness only
]);

describe("API routes", () => {
  const routes = files("app/api", /^route\.ts$/).map(posix);

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it.each(routes.filter((r) => !PUBLIC_ROUTES.has(r)))("%s goes through a guarded handler", (route) => {
    const text = readFileSync(route, "utf8");
    const guarded =
      // Handler factories, each of which starts with a guard (checked below).
      /from "@\/lib\/(dm|access|play|sheets)\/[A-Za-z]*([Rr]outes|[Ss]earch)"/.test(text) ||
      // The bot proxy and upload pipelines, which check the session and the rule's permission.
      (text.includes("handleBotRequest") && text.includes("allowsFor(access)")) ||
      // A route that calls a guard itself.
      /await guard(Dm|Api)\(/.test(text);
    expect(guarded, `${route} has no guard`).toBe(true);
  });
});

describe("route handler factories", () => {
  const sources = [...files("lib", /Routes\.ts$|^routes\.ts$|Search\.ts$/)].map(posix).filter((f) => !f.endsWith("spellSearch.ts"));

  it("finds the handler files", () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it.each(sources)("%s runs a guard first in every handler", (source) => {
    const text = readFileSync(source, "utf8");
    const handlers = [...text.matchAll(/async (GET|POST|PUT|PATCH|DELETE)\([^)]*\)[^{]*\{\r?\n([^\r\n]*)/g)];
    expect(handlers.length, source).toBeGreaterThan(0);
    for (const [, method, firstLine] of handlers) {
      expect(firstLine, `${source} ${method}`).toMatch(/const guard = await guard(Dm|Api)\(request, deps/);
    }
  });
});

describe("portal pages", () => {
  const pages = files("app/(portal)", /^(page|layout)\.tsx$/).map(posix);
  // Pages any signed-in user may open: they show only what the user's access allows.
  const SIGNED_IN = new Set(["app/(portal)/page.tsx", "app/(portal)/layout.tsx", "app/(portal)/settings/page.tsx"]);

  it.each(pages)("%s checks access on the server", (page) => {
    const text = readFileSync(page, "utf8");
    const gate = /await (requireAccess|requireAnyAccess|requireOwner|requireDm|requirePlay)\(/.test(text);
    if (SIGNED_IN.has(page)) expect(/await requireUser\(\)/.test(text) || gate, page).toBe(true);
    else expect(gate, `${page} has no permission gate`).toBe(true);
  });
});
