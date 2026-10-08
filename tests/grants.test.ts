import { describe, expect, it } from "vitest";
import { GrantRepo, grantInputSchema, seedGrants, SettingsRepo, UserRepo } from "@/lib/access/grants";
import { PRESETS } from "@/lib/access/permissions";
import { openDatabase } from "@/lib/dm/db";

const ROLE = "333333333333333333";
const OTHER = "444444444444444444";
const OWNER = "111111111111111111";
const A = "aaaaaaaaaaaa";

describe("grants", () => {
  it("creates, replaces and removes a grant with its campaigns", () => {
    const repo = new GrantRepo(openDatabase(":memory:"));
    repo.put(ROLE, { permissions: ["play", "play"], scope: [A, A], label: "Players" }, OWNER);
    expect(repo.get(ROLE)).toMatchObject({ roleId: ROLE, label: "Players", permissions: ["play"], scope: [A], updatedBy: OWNER });
    repo.put(ROLE, { permissions: ["dm", "bot.view"], scope: "all" }, OWNER);
    expect(repo.get(ROLE)).toMatchObject({ permissions: ["bot.view", "dm"], scope: "all" });
    expect(repo.remove(ROLE)).toBe(true);
    expect(repo.list()).toEqual([]);
    expect(repo.remove(ROLE)).toBe(false);
  });

  it("refuses bad role ids, unknown permissions and bad campaigns", () => {
    const repo = new GrantRepo(openDatabase(":memory:"));
    expect(() => repo.put("1", { permissions: ["play"], scope: "all" }, OWNER)).toThrow();
    expect(grantInputSchema.safeParse({ permissions: ["admin"], scope: "all" }).success).toBe(false);
    expect(grantInputSchema.safeParse({ permissions: ["play"], scope: ["nope"] }).success).toBe(false);
    expect(grantInputSchema.safeParse({ permissions: ["play"], scope: Array(51).fill(A) }).success).toBe(false);
    expect(grantInputSchema.safeParse({ permissions: ["play"], scope: "all", extra: 1 }).success).toBe(false);
    expect(repo.remove("1 OR 1=1")).toBe(false);
  });

  it("reads a damaged permission list as no permissions", () => {
    const db = openDatabase(":memory:");
    const repo = new GrantRepo(db);
    repo.put(ROLE, { permissions: ["play"], scope: "all" }, OWNER);
    db.prepare("UPDATE role_grants SET permissions = 'not json'").run();
    expect(repo.get(ROLE)?.permissions).toEqual([]);
  });
});

describe("seeding", () => {
  it("turns ALLOWED_ROLE_IDS into Bot operator grants exactly once", () => {
    const db = openDatabase(":memory:");
    expect(seedGrants(db, [ROLE, OTHER, ROLE, "bad"])).toBe(true);
    const grants = new GrantRepo(db).list();
    expect(grants.map((g) => g.roleId).sort()).toEqual([ROLE, OTHER].sort());
    expect(grants[0].permissions).toEqual([...PRESETS.operator.permissions].sort());
    expect(grants[0].scope).toBe("all");

    new GrantRepo(db).remove(OTHER);
    expect(seedGrants(db, [ROLE, OTHER])).toBe(false);
    expect(new GrantRepo(db).list().map((g) => g.roleId)).toEqual([ROLE]);
  });

  it("marks itself done even with no roles to copy", () => {
    const db = openDatabase(":memory:");
    expect(seedGrants(db, [])).toBe(true);
    expect(new SettingsRepo(db).get("access_seeded")).not.toBeNull();
    expect(new GrantRepo(db).list()).toEqual([]);
  });
});

describe("signed-in users", () => {
  it("remembers names and roles, keeps only Discord CDN avatars and strips control characters", () => {
    const repo = new UserRepo(openDatabase(":memory:"));
    repo.upsert(OWNER, "Aria‮\u0007", "https://cdn.discordapp.com/avatars/1/abc.png", [ROLE, "x"]);
    expect(repo.get(OWNER)).toMatchObject({ displayName: "Aria", avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png", roleIds: [ROLE] });
    repo.upsert(OWNER, "", "https://evil.example/a.png", []);
    expect(repo.get(OWNER)).toMatchObject({ displayName: "Discord user", avatarUrl: null, roleIds: [] });
    repo.upsert("nope", "x", null, []);
    expect(repo.list()).toHaveLength(1);
  });
});
