import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bot, BotError } from "@/lib/bot/client";
import { isDemoPath, stripBase, withBase } from "@/lib/demo/base";
import { dm, DmError } from "@/lib/dm/client";
import { readDemo, resetDemo } from "@/lib/demo/store";

// The demo is public, so what matters is what it cannot do: reach the portal API,
// read anything server-side, or leak into the real portal's pages.

function browserAt(pathname: string) {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname, protocol: "https:" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
  });
}

describe("demo paths", () => {
  it("covers /demo and below only", () => {
    for (const path of ["/demo", "/demo/", "/demo/dm/npcs", "/demo/bot/sessions/2026-09-16-2030-b2c3d4e5"]) expect(isDemoPath(path)).toBe(true);
    for (const path of ["/", "/demonstration", "/demo-x", "/demox/dm", "/dm/demo", "/api/demo", "/signin", "/DEMO"]) expect(isDemoPath(path)).toBe(false);
  });

  it("keeps in-portal links inside the demo and leaves everything else alone", () => {
    expect(withBase("/", true)).toBe("/demo");
    expect(withBase("/dm/npcs", true)).toBe("/demo/dm/npcs");
    expect(withBase("/demo/dm", true)).toBe("/demo/dm");
    expect(withBase("#recording-now", true)).toBe("#recording-now");
    expect(withBase("//evil.example/x", true)).toBe("//evil.example/x");
    expect(withBase("https://www.youtube.com/watch?v=abc", true)).toBe("https://www.youtube.com/watch?v=abc");
    expect(withBase("/dm/npcs", false)).toBe("/dm/npcs");
    expect(stripBase("/demo")).toBe("/");
    expect(stripBase("/demo/dm/dice")).toBe("/dm/dice");
    expect(stripBase("/dm/dice")).toBe("/dm/dice");
  });
});

describe("demo transport", () => {
  const fetchSpy = vi.fn(async () => Response.json({ real: true }));

  beforeEach(() => {
    resetDemo();
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches and edits spells and feats like the real API", async () => {
    browserAt("/demo/dm/spells");
    const cantrips = await dm.searchSpells({ level: "0" });
    expect(cantrips.results.length).toBeGreaterThan(0);
    expect(cantrips.results.every((s) => s.level === 0)).toBe(true);
    await expect(dm.searchSpells({ level: "12" })).rejects.toBeInstanceOf(DmError);
    const custom = await dm.searchSpells({ source: "custom" });
    expect(custom.results.map((s) => s.name)).toContain("Ember Lance");
    const fireball = await dm.getSrdSpell("2024", "fireball");
    expect(fireball.level).toBe(3);
    await expect(dm.createSpell({ ...fireball, level: 10 })).rejects.toMatchObject({ status: 400 });
    const created = await dm.createSpell({ ...fireball, name: "House Fireball" });
    expect((await dm.shareSpell(created.id, false)).shared).toBe(false);
    await dm.deleteSpell(created.id);
    expect((await dm.searchFeats({ category: "Origin" })).results.map((f) => f.name)).toContain("Guild-Sworn");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the demo as the persona picked: an owner, a co-DM or a player", async () => {
    browserAt("/demo/play");
    const { personaAccess } = await import("@/lib/demo/persona");
    const { allowed, gateFor } = await import("@/components/demo/DemoShell");
    const { accessApi } = await import("@/lib/access/client");
    const { sheets } = await import("@/lib/sheets/client");
    const { DEMO_SHEET_WIZARD } = await import("@/lib/demo/sheetFixtures");

    // Owner by default: everything, including the access editor and the DM's notes.
    expect((await accessApi.me()).owner).toBe(true);
    expect((await sheets.get(DEMO_SHEET_WIZARD)).dmNotes).toBeTruthy();

    window.localStorage.setItem("demo.portal.viewAs", "player");
    expect(await accessApi.me()).toEqual({ owner: false, permissions: { play: ["dead0c0de001"] } });
    await expect(accessApi.grants()).rejects.toMatchObject({ status: 404 });
    const asPlayer = await sheets.get(DEMO_SHEET_WIZARD);
    expect(asPlayer.manager).toBe(false);
    expect("dmNotes" in asPlayer).toBe(false);
    const player = personaAccess("player");
    expect(allowed(player, gateFor("/demo/play/c/dead0c0de001"))).toBe(true);
    expect(allowed(player, gateFor("/demo/dm/combat"))).toBe(false);
    expect(allowed(player, gateFor("/demo/bot/sessions"))).toBe(false);
    expect(allowed(player, gateFor("/demo/settings"))).toBe(true);
    expect(allowed(personaAccess("codm"), gateFor("/demo/settings/access"))).toBe(false);
    expect(allowed(personaAccess("codm"), gateFor("/demo/dm/party"))).toBe(true);
    expect(allowed(personaAccess("codm"), gateFor("/demo/bot/music"))).toBe(false);
    window.localStorage.setItem("demo.portal.viewAs", "");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers every client call under /demo without a network request", async () => {
    browserAt("/demo/bot");
    const stats = await bot.stats();
    expect(stats.version).toBe("demo");
    await bot.sessions(10);
    await bot.musicState();
    await bot.campaigns();
    await dm.listAreas();
    await dm.listEncounters();
    await dm.searchItems({ q: "sword" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still calls the real API everywhere else", async () => {
    browserAt("/bot");
    await bot.stats();
    expect(fetchSpy).toHaveBeenCalledWith("/api/bot/stats", expect.objectContaining({ method: "GET" }));
  });

  it("refuses what the proxy allowlist refuses", async () => {
    browserAt("/demo/bot");
    await expect(bot.startRecording({ channel_id: "not-a-snowflake" })).rejects.toMatchObject({ status: 400 });
    await expect(bot.transcript("../../etc", 0)).rejects.toBeInstanceOf(BotError);
    await expect(dm.createArea({ name: "", summary: "", notes: "" })).rejects.toBeInstanceOf(DmError);
    await expect(dm.setTags("file:///etc/passwd", ["x"])).rejects.toMatchObject({ status: 400 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps changes in the tab, and a copy never aliases the store", async () => {
    browserAt("/demo/dm/areas");
    const created = await dm.createArea({ name: "Goblin Warrens", summary: "", notes: "" });
    expect((await dm.listAreas()).some((area) => area.id === created.area.id)).toBe(true);
    created.area.name = "changed by a component";
    expect(readDemo().dm.areas.find((area) => area.id === created.area.id)?.name).toBe("Goblin Warrens");
    resetDemo();
    expect((await dm.listAreas()).some((area) => area.id === created.area.id)).toBe(false);
  });

  it("detects a stale encounter save like the real API", async () => {
    browserAt("/demo/dm/combat");
    const [first] = await dm.listEncounters();
    const stored = await dm.getEncounter(first.id);
    await dm.saveEncounter(stored.id, stored.version, stored.encounter);
    await expect(dm.saveEncounter(stored.id, stored.version, stored.encounter)).rejects.toMatchObject({ status: 409 });
  });

  it("does not exist on the server, where it would be shared by every visitor", () => {
    expect(() => readDemo()).toThrow();
  });
});

// Walks a folder for .ts/.tsx files.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("demo code stays away from server-side data", () => {
  const FORBIDDEN = [
    "@/auth",
    "@/lib/env",
    "@/lib/session",
    "@/lib/audit",
    "@/lib/dm/access",
    "@/lib/dm/database",
    "@/lib/dm/db",
    "@/lib/dm/routeDeps",
    "@/lib/dm/srd",
    "@/lib/dm/srdItems",
    "@/lib/dm/srdSpells",
    "@/lib/bot/proxy",
    "@/lib/bot/upload",
    "@/lib/campaign/selected",
    "server-only",
    "node:sqlite",
  ];
  const files = ["app/demo", "components/demo", "components/views", "lib/demo"].flatMap(sources);

  it("finds the demo files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(files)("%s imports nothing server-side", (file) => {
    const text = readFileSync(file, "utf8");
    const imports = [...text.matchAll(/from\s+"([^"]+)"|import\s+"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    for (const spec of imports) expect(FORBIDDEN, `${file} imports ${spec}`).not.toContain(spec);
    expect(text, `${file} calls fetch`).not.toMatch(/\bfetch\(/);
  });

  it("demo fixtures carry no real-looking Discord ids", () => {
    const text = readFileSync("lib/demo/fixtures.ts", "utf8");
    for (const [id] of text.matchAll(/\b\d{17,20}\b/g)) expect(id).toMatch(/^[01]0{14,}\d{0,3}$/);
  });
});
