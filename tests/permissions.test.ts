import { describe, expect, it } from "vitest";
import { campaignsFor, can, fromSummary, hasAnyAccess, PRESETS, resolveAccess, seesUnassigned, summarise, type Grant } from "@/lib/access/permissions";

const OWNER = "111111111111111111";
const USER = "222222222222222222";
const PLAYERS = "333333333333333333";
const STRAHD = "444444444444444444";
const OPS = "555555555555555555";
const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";

const grants: Grant[] = [
  { roleId: PLAYERS, permissions: ["play"], scope: [A] },
  { roleId: STRAHD, permissions: ["play", "dm"], scope: [B] },
  { roleId: OPS, permissions: [...PRESETS.operator.permissions], scope: [A] },
];

describe("resolveAccess", () => {
  it("gives the owner everything, everywhere, roles or not", () => {
    const access = resolveAccess(OWNER, [], [OWNER], []);
    expect(access.owner).toBe(true);
    expect(can(access, "dm", null)).toBe(true);
    expect(can(access, "bot.recording")).toBe(true);
    expect(seesUnassigned(access, "dm")).toBe(true);
  });

  it("gives nothing without a matching role", () => {
    const access = resolveAccess(USER, ["999999999999999999"], [OWNER], grants);
    expect(hasAnyAccess(access)).toBe(false);
    expect(can(access, "play")).toBe(false);
  });

  it("does not treat an empty id as the owner", () => {
    expect(resolveAccess("", [], ["", OWNER], []).owner).toBe(false);
  });

  it("unions grants across roles and scopes", () => {
    const access = resolveAccess(USER, [PLAYERS, STRAHD], [OWNER], grants);
    expect(can(access, "play", A)).toBe(true);
    expect(can(access, "play", B)).toBe(true);
    expect(can(access, "dm", A)).toBe(false);
    expect(can(access, "dm", B)).toBe(true);
    expect(campaignsFor(access, "play")).toEqual(new Set([A, B]));
  });

  it("lets dm imply sheets.manage with the same scope", () => {
    const access = resolveAccess(USER, [STRAHD], [OWNER], grants);
    expect(can(access, "sheets.manage", B)).toBe(true);
    expect(can(access, "sheets.manage", A)).toBe(false);
  });

  it("keeps bot permissions global whatever the grant's scope", () => {
    const access = resolveAccess(USER, [OPS], [OWNER], grants);
    expect(can(access, "bot.music")).toBe(true);
    expect(campaignsFor(access, "bot.music")).toBe("all");
  });

  it("lets 'all' win over a list, and only 'all' reaches unassigned content", () => {
    const all: Grant = { roleId: "666666666666666666", permissions: ["dm"], scope: "all" };
    const scoped = resolveAccess(USER, [STRAHD], [OWNER], [...grants, all]);
    expect(seesUnassigned(scoped, "dm")).toBe(false);
    expect(can(scoped, "dm", null)).toBe(false);
    const wide = resolveAccess(USER, [STRAHD, all.roleId], [OWNER], [...grants, all]);
    expect(campaignsFor(wide, "dm")).toBe("all");
    expect(can(wide, "dm", null)).toBe(true);
  });

  it("ignores unknown permission names and empty campaign lists", () => {
    const odd: Grant[] = [
      { roleId: PLAYERS, permissions: ["admin", "play"], scope: [] },
      { roleId: PLAYERS, permissions: ["superuser"], scope: "all" },
    ];
    const access = resolveAccess(USER, [PLAYERS], [OWNER], odd);
    expect(access.grants.size).toBe(0);
    expect(hasAnyAccess(access)).toBe(false);
  });

  it("answers 'anywhere?' without a campaign and 'here?' with one", () => {
    const access = resolveAccess(USER, [PLAYERS], [OWNER], grants);
    expect(can(access, "play")).toBe(true);
    expect(can(access, "play", B)).toBe(false);
    expect(can(access, "play", null)).toBe(false);
  });

  it("round-trips through the browser summary", () => {
    const access = resolveAccess(USER, [PLAYERS, STRAHD], [OWNER], grants);
    const back = fromSummary(USER, JSON.parse(JSON.stringify(summarise(access))));
    expect(can(back, "dm", B)).toBe(true);
    expect(can(back, "dm", A)).toBe(false);
    expect(summarise(back)).toEqual(summarise(access));
  });
});
