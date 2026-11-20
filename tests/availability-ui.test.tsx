import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { PlayerPicker } from "@/components/availability/PlayerPicker";
import { windowDays } from "@/lib/availability/days";

const TODAY = "2026-11-20"; // a Friday
const days = windowDays(TODAY);
const noop = () => undefined;

const grid = (over: Partial<Parameters<typeof AvailabilityGrid>[0]> = {}) =>
  renderToStaticMarkup(<AvailabilityGrid days={days} today={TODAY} mine={new Set()} counts={{}} total={3} onToggle={noop} {...over} />);

describe("availability grid", () => {
  it("renders every day as a button", () => {
    expect(grid().match(/<button/g)).toHaveLength(56);
  });

  it("leaves the days before the first weekday blank (Friday starts in column five)", () => {
    expect(grid().match(/aria-hidden="true"/g)).toHaveLength(4);
  });

  it("disables past days only", () => {
    const html = grid({ days: ["2026-11-19", "2026-11-20", "2026-11-21"] });
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain("Thu 19 Nov");
  });

  it("shows n/total, marks my days, and highlights a day everyone is free", () => {
    const html = grid({ mine: new Set(["2026-11-21"]), counts: { "2026-11-21": 3, "2026-11-22": 1 } });
    expect(html).toContain("3/3");
    expect(html).toContain("1/3");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("ring-ok");
  });

  it("does not highlight a day when fewer than two players are listed", () => {
    expect(grid({ total: 1, counts: { "2026-11-21": 1 } })).not.toContain("ring-ok");
  });

  it("shows who is free to the owner as a tooltip", () => {
    expect(grid({ who: { "2026-11-21": ["Ann", "Bo"] } })).toContain('title="Ann, Bo"');
  });
});

describe("player picker", () => {
  const view = {
    candidates: [
      { userId: "1", displayName: "Ann", avatarUrl: null },
      { userId: "2", displayName: "Bo", avatarUrl: null },
    ],
    selected: ["1"],
    lastError: null,
  };

  it("lists every candidate with the chosen ones ticked", () => {
    const html = renderToStaticMarkup(<PlayerPicker view={view} selected={new Set(["1"])} onToggle={noop} />);
    expect(html).toContain("Ann");
    expect(html).toContain("Bo");
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it("says so when nobody has signed in", () => {
    expect(renderToStaticMarkup(<PlayerPicker view={{ ...view, candidates: [] }} selected={new Set()} onToggle={noop} />)).toContain("Nobody has signed in");
  });
});
