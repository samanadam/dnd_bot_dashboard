import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailabilityGrid } from "@/components/availability/AvailabilityGrid";
import { BestDays } from "@/components/availability/BestDays";
import { DayPanel } from "@/components/availability/DayPanel";
import { PlayerPicker } from "@/components/availability/PlayerPicker";
import { windowDays } from "@/lib/availability/days";

const TODAY = "2026-11-20"; // a Friday
const days = windowDays(TODAY);
const noop = () => undefined;

const grid = (over: Partial<Parameters<typeof AvailabilityGrid>[0]> = {}) =>
  renderToStaticMarkup(
    <AvailabilityGrid days={days} today={TODAY} mine={new Set()} counts={{}} total={3} selected={null} onSelect={noop} onWeekday={noop} {...over} />,
  );

describe("availability grid", () => {
  it("names each month so a date is never ambiguous", () => {
    const html = grid();
    expect(html).toContain("November 2026");
    expect(html).toContain("December 2026");
    expect(html).toContain("January 2027");
  });

  it("renders every day as a button, plus seven weekday shortcuts", () => {
    const html = grid({ days: ["2026-11-21", "2026-11-22"] });
    // 2 days + 7 weekday headers
    expect(html.match(/<button/g)).toHaveLength(9);
    expect(html).toContain("Tick or untick every upcoming Saturday");
  });

  it("marks today, and disables only past days", () => {
    const html = grid({ days: ["2026-11-19", "2026-11-20", "2026-11-21"] });
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html).toContain("Fri 20 Nov, today");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it("says nothing for a day nobody can do, and n/total otherwise", () => {
    const html = grid({ days: ["2026-11-21", "2026-11-22"], counts: { "2026-11-22": 2 } });
    expect(html).toContain("2/3");
    expect(html).not.toContain("0/3"); // quiet days stay quiet
    expect(html).toContain("0 of 3 free"); // but screen readers still get the number
  });

  it("tints by how many are free, using theme variables only", () => {
    const html = grid({ days: ["2026-11-21", "2026-11-22"], counts: { "2026-11-21": 3, "2026-11-22": 1 } });
    expect(html).toContain("color-mix(in oklab, var(--ok) 38%, var(--surface-2))");
    expect(html).toContain("color-mix(in oklab, var(--ok) 13%, var(--surface-2))");
    // No literal colours: that is what keeps it in step with the chosen theme.
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).not.toMatch(/rgb\(/);
  });

  it("shows a check on my days and 'All' on a day everyone can do", () => {
    const html = grid({ days: ["2026-11-21", "2026-11-22"], mine: new Set(["2026-11-21"]), counts: { "2026-11-21": 3, "2026-11-22": 1 } });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("you are free");
    expect(html).toContain(">All<");
    expect(html).toContain("border-ok");
  });

  it("does not call a day 'All' when fewer than two players are listed", () => {
    const html = grid({ days: ["2026-11-21"], total: 1, counts: { "2026-11-21": 1 } });
    expect(html).not.toContain(">All<");
  });

  it("marks the selected day", () => {
    expect(grid({ days: ["2026-11-21", "2026-11-22"], selected: "2026-11-22" }).match(/data-selected="true"/g)).toHaveLength(1);
  });
});

describe("best days", () => {
  it("lists each day with who is missing", () => {
    const html = renderToStaticMarkup(
      <BestDays
        best={[
          { day: "2026-11-29", count: 3, missing: [] },
          { day: "2026-11-28", count: 2, missing: ["Cy"] },
        ]}
        total={3}
        selected={null}
        onPick={noop}
      />,
    );
    expect(html).toContain("Sun 29 Nov");
    expect(html).toContain("Everyone can play");
    expect(html).toContain("Missing: Cy");
    expect(html).toContain("2/3");
  });

  it("explains an empty list for both reasons", () => {
    expect(renderToStaticMarkup(<BestDays best={[]} total={3} selected={null} onPick={noop} />)).toContain("No day works for anyone yet");
    expect(renderToStaticMarkup(<BestDays best={[]} total={0} selected={null} onPick={noop} />)).toContain("has not listed the players");
  });
});

describe("day panel", () => {
  it("invites a tap when no day is picked", () => {
    expect(renderToStaticMarkup(<DayPanel day={null} free={[]} players={["Ann"]} mine={false} />)).toContain("Tap a day");
  });

  it("names who is free and who is not", () => {
    const html = renderToStaticMarkup(<DayPanel day="2026-11-28" free={["Ann", "Bo"]} players={["Ann", "Bo", "Cy"]} mine />);
    expect(html).toContain("Sat 28 Nov");
    expect(html).toContain("Ann, Bo");
    expect(html).toContain("Not free: </span>Cy");
    expect(html).toContain("You marked this day as free");
  });

  it("says so when nobody is free and omits the not-free line when everyone is", () => {
    expect(renderToStaticMarkup(<DayPanel day="2026-11-28" free={[]} players={["Ann"]} mine={false} />)).toContain("nobody yet");
    expect(renderToStaticMarkup(<DayPanel day="2026-11-28" free={["Ann"]} players={["Ann"]} mine={false} />)).not.toContain("Not free");
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
