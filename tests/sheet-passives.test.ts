import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/dm/db";
import { summaryOf } from "@/lib/sheets/access";
import { newBody } from "@/lib/sheets/body";
import { PASSIVES, shownPassives, togglePassive } from "@/lib/sheets/passives";
import { SheetRepo } from "@/lib/sheets/repo";

describe("which passive scores the DM's party cards show", () => {
  it("shows all three until the DM chooses otherwise", () => {
    expect(PASSIVES).toEqual(["perception", "investigation", "insight"]);
    expect(shownPassives("")).toEqual(["perception", "investigation", "insight"]);
  });

  it("reads a stored choice in a fixed order, ignoring junk and repeats", () => {
    expect(shownPassives("insight,perception")).toEqual(["perception", "insight"]);
    expect(shownPassives("insight,bogus,insight")).toEqual(["insight"]);
    expect(shownPassives("none")).toEqual([]);
    expect(shownPassives("bogus")).toEqual([]);
  });

  it("toggles one on or off and answers what to store, with 'none' for an empty choice", () => {
    expect(togglePassive(["perception", "investigation", "insight"], "investigation")).toBe("perception,insight");
    expect(togglePassive(["perception"], "perception")).toBe("none");
    expect(togglePassive([], "insight")).toBe("insight");
    expect(shownPassives(togglePassive(shownPassives(""), "insight"))).toEqual(["perception", "investigation"]);
  });
});

describe("the party card data", () => {
  it("carries all three passive scores worked out from the sheet", () => {
    const db = openDatabase(":memory:");
    const repo = new SheetRepo(db);
    const body = newBody("Pass Test");
    body.abilities.wis.base = 14; // +2
    body.abilities.int.base = 16; // +3
    body.proficiencies.skills.perception = "proficient";
    body.proficiencies.skills.insight = "expertise";
    const sheet = repo.create({ campaignId: "aaaaaaaaaaaa", ownerUserId: "1", edition: "2024", name: "Pass Test", body });
    if (sheet === "limit") throw new Error("limit");
    // level 1: proficiency +2. Perception 10 + 2 + 2, insight 10 + 2 + 4, investigation 10 + 3.
    expect(summaryOf(sheet, "1", "Aria").passive).toEqual({ perception: 14, investigation: 13, insight: 16 });
  });
});
