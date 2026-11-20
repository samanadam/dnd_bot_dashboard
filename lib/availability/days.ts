// Whole-day helpers for the availability calendar. Days are plain
// "YYYY-MM-DD" strings in the group's timezone; arithmetic is done in UTC at
// noon so daylight-saving shifts can never move a day.

export const GROUP_TZ = "Europe/Istanbul";
export const WINDOW_DAYS = 56;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const at = (day: string) => new Date(`${day}T12:00:00Z`);

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const date = at(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function todayInGroupTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: GROUP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function windowDays(today: string): string[] {
  const start = at(today).getTime();
  return Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

export function formatDay(day: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).formatToParts(at(day));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}
