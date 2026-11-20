import { describe, expect, it } from "vitest";
import { formatDay, isDay, todayInGroupTz, windowDays } from "@/lib/availability/days";

describe("availability days", () => {
  it("follows Istanbul midnight, not UTC", () => {
    expect(todayInGroupTz(new Date("2026-11-19T23:30:00Z"))).toBe("2026-11-20");
    expect(todayInGroupTz(new Date("2026-11-19T20:30:00Z"))).toBe("2026-11-19");
  });

  it("lists 56 days from today", () => {
    const days = windowDays("2026-11-20");
    expect(days).toHaveLength(56);
    expect(days[0]).toBe("2026-11-20");
    expect(days[55]).toBe("2027-01-14");
  });

  it("accepts only real calendar dates", () => {
    expect(isDay("2026-11-20")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("26-11-20")).toBe(false);
    expect(isDay(20261120)).toBe(false);
  });

  it("formats a day for people", () => {
    expect(formatDay("2026-11-28")).toBe("Sat 28 Nov");
  });
});
