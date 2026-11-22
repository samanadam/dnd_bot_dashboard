import { describe, expect, it } from "vitest";
import { windowDays } from "@/lib/availability/days";
import { bestDays, column, heat, monthBlocks, toggleWeekday } from "@/lib/availability/view";

const TODAY = "2026-11-20"; // a Friday
const days = windowDays(TODAY);

describe("monthBlocks", () => {
  const blocks = monthBlocks(days);

  it("starts a new block at each month, with its name", () => {
    expect(blocks.map((b) => b.label)).toEqual(["November 2026", "December 2026", "January 2027"]);
  });

  it("pads the first row so days land under the right weekday (Friday is column four)", () => {
    expect(blocks[0].cells.slice(0, 5)).toEqual([null, null, null, null, "2026-11-20"]);
    expect(blocks[1].cells.indexOf("2026-12-01")).toBe(1); // a Tuesday
  });

  it("holds every day exactly once and nothing else", () => {
    expect(blocks.flatMap((b) => b.cells).filter((c) => c !== null)).toEqual(days);
  });

  it("is empty for no days", () => {
    expect(monthBlocks([])).toEqual([]);
  });
});

describe("column", () => {
  it("is Monday-first", () => {
    expect(column("2026-11-23")).toBe(0); // Monday
    expect(column("2026-11-29")).toBe(6); // Sunday
  });
});

describe("heat", () => {
  it("is the share of players free, capped at 1", () => {
    expect(heat(0, 3)).toBe(0);
    expect(heat(2, 4)).toBe(0.5);
    expect(heat(5, 3)).toBe(1);
    expect(heat(1, 0)).toBe(0);
  });
});

describe("bestDays", () => {
  const players = ["Ann", "Bo", "Cy"];
  const who = {
    "2026-11-20": ["Ann", "Bo", "Cy"], // today: never offered
    "2026-11-28": ["Ann", "Bo"],
    "2026-11-29": ["Ann", "Bo", "Cy"],
    "2026-12-05": ["Ann"],
    "2026-12-06": ["Bo"],
  };
  const counts = Object.fromEntries(Object.entries(who).map(([d, n]) => [d, n.length]));

  it("lists upcoming days, most free first, then earliest, with who is missing", () => {
    const best = bestDays({ today: TODAY, counts, who, players }, 3);
    expect(best.map((b) => b.day)).toEqual(["2026-11-29", "2026-11-28", "2026-12-05"]);
    expect(best[0].missing).toEqual([]);
    expect(best[1].missing).toEqual(["Cy"]);
  });

  it("offers nothing with fewer than two players, or when nobody is free", () => {
    expect(bestDays({ today: TODAY, counts, who, players: ["Ann"] }, 3)).toEqual([]);
    expect(bestDays({ today: TODAY, counts: {}, who: {}, players }, 3)).toEqual([]);
  });
});

describe("toggleWeekday", () => {
  const saturdays = days.filter((d) => column(d) === 5);

  it("adds every upcoming Saturday, keeping other days", () => {
    const result = toggleWeekday(["2026-11-23"], days, TODAY, 5);
    expect(result).toEqual(["2026-11-23", ...saturdays].sort());
  });

  it("removes them all when every Saturday is already ticked", () => {
    const result = toggleWeekday(["2026-11-23", ...saturdays], days, TODAY, 5);
    expect(result).toEqual(["2026-11-23"]);
  });

  it("adds the rest when only some are ticked", () => {
    expect(toggleWeekday([saturdays[0]], days, TODAY, 5)).toEqual(saturdays);
  });

  it("never touches days before today", () => {
    const past = ["2026-11-14"];
    expect(toggleWeekday(past, windowDays("2026-11-14"), TODAY, 5)).toContain("2026-11-14");
  });
});
