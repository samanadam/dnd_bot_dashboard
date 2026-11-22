import { z } from "zod";
import type { PortalUser } from "@/lib/access/grants";
import { guardApi, invalidBody, readDmJson, type DmGuardDeps } from "@/lib/dm/guard";
import { json, type AuditLog } from "@/lib/dm/http";
import { isDay, todayInGroupTz, windowDays, WINDOW_DAYS } from "./days";
import { buildNudge, type Notifier } from "./notify";
import { CAMPAIGN, type AvailabilityRepo } from "./repo";

// /api/dm/availability: the session-day calendar. Players mark their own free
// days; the owner picks who counts as "everyone". When the last player ticks a
// date, the owner gets one Telegram message (see notify.ts). Routes live under
// /api/dm so the browser's dmCall client is reused; the permission, not the
// path, decides who may call.

export type AvailabilityDeps = DmGuardDeps & {
  repo: () => AvailabilityRepo;
  users: () => PortalUser[];
  settings: () => { get(key: string): string | null; set(key: string, value: string): void };
  notify: () => Notifier | null;
  now?: () => Date;
  log?: AuditLog;
};

const LAST_ERROR = "availability_last_error";
const MAX_SENT = 3;

const today = (deps: AvailabilityDeps) => todayInGroupTz(deps.now?.() ?? new Date());

/**
 * Announce days that just became unanimous. Never throws: a failed send gives
 * the days back, so the next save retries, and the failure is recorded for the
 * owner. With no Telegram configured nothing is claimed, so turning it on
 * later still announces dates that are already unanimous.
 */
async function runTrigger(deps: AvailabilityDeps, userId: string): Promise<void> {
  try {
    const notify = deps.notify();
    if (!notify) return;
    const repo = deps.repo();
    const claimed = repo.claimUnanimous(CAMPAIGN, today(deps));
    if (claimed.length === 0) return;
    const send = claimed.slice(0, MAX_SENT);
    try {
      await notify(buildNudge(send));
      // Days the message did not name go back, so the next save announces them.
      repo.unclaim(CAMPAIGN, claimed.slice(MAX_SENT));
      deps.settings().set(LAST_ERROR, "");
    } catch (error) {
      repo.unclaim(CAMPAIGN, claimed);
      deps.settings().set(LAST_ERROR, `${new Date().toISOString()} ${String(error).slice(0, 120)}`);
      deps.log?.({ event: "play_write", userId, outcome: "telegram_failed" });
    }
  } catch (error) {
    deps.log?.({ event: "play_write", userId, outcome: "trigger_failed", detail: String(error).slice(0, 120) });
  }
}

const daysBody = z.object({ days: z.array(z.string()).max(WINDOW_DAYS) });

export function availabilityCollection(deps: AvailabilityDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "play");
      if (!guard.ok) return guard.response;
      const repo = deps.repo();
      const now = today(deps);
      const days = windowDays(now);
      const players = repo.players(CAMPAIGN);
      const playerSet = new Set(players);
      const names = new Map(deps.users().map((user) => [user.userId, user.displayName]));
      const free = repo.freeByDay(CAMPAIGN, days[0], days[days.length - 1]);
      const counts: Record<string, number> = {};
      const who: Record<string, string[]> = {};
      const mine: string[] = [];
      for (const [day, ids] of Object.entries(free)) {
        if (ids.includes(guard.userId)) mine.push(day);
        const listed = ids.filter((id) => playerSet.has(id));
        if (listed.length > 0) {
          counts[day] = listed.length;
          who[day] = listed.map((id) => names.get(id) ?? "Player");
        }
      }
      return json({
        today: now,
        days,
        mine,
        counts,
        total: players.length,
        players: players.map((id) => names.get(id) ?? "Player"),
        who,
      });
    },

    async PUT(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "play");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = daysBody.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const now = today(deps);
      const window = windowDays(now);
      const last = window[window.length - 1];
      for (const day of parsed.data.days) {
        if (!isDay(day) || day > last) return invalidBody([{ path: ["days"], message: `${day.slice(0, 20)} is not a day in the next ${WINDOW_DAYS} days` }]);
      }
      deps.repo().setFreeDays(CAMPAIGN, guard.userId, parsed.data.days, now);
      deps.log?.({ event: "play_write", userId: guard.userId, method: "PUT", path: "availability", status: 200 });
      await runTrigger(deps, guard.userId);
      return json({ saved: true });
    },
  };
}

const playersBody = z.object({ userIds: z.array(z.string()).max(100) });

export function availabilityPlayers(deps: AvailabilityDeps) {
  return {
    async GET(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const lastError = deps.settings().get(LAST_ERROR) || null;
      return json({
        candidates: deps.users().map(({ userId, displayName, avatarUrl }) => ({ userId, displayName, avatarUrl })),
        selected: deps.repo().players(CAMPAIGN),
        lastError,
      });
    },

    async PUT(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const body = await readDmJson(request);
      if (!body.ok) return body.response;
      const parsed = playersBody.safeParse(body.json);
      if (!parsed.success) return invalidBody(parsed.error.issues);
      const known = new Set(deps.users().map((user) => user.userId));
      if (!parsed.data.userIds.every((id) => known.has(id))) return invalidBody([{ path: ["userIds"], message: "unknown user" }]);
      deps.repo().setPlayers(CAMPAIGN, parsed.data.userIds);
      deps.log?.({ event: "dm_write", userId: guard.userId, method: "PUT", path: "availability/players", status: 200 });
      await runTrigger(deps, guard.userId);
      return json({ saved: true });
    },
  };
}

export function availabilityTest(deps: AvailabilityDeps) {
  return {
    async POST(request: Request): Promise<Response> {
      const guard = await guardApi(request, deps, "owner");
      if (!guard.ok) return guard.response;
      const notify = deps.notify();
      if (!notify) return json({ sent: false, reason: "not_configured" });
      try {
        // A real-looking message about a day far in the future would be mistaken for the real thing.
        await notify({ text: "Test message from the portal. Availability messages will arrive here.", shareUrl: "https://wa.me/?text=" + encodeURIComponent("Test") });
        return json({ sent: true });
      } catch {
        return json({ sent: false, reason: "failed" });
      }
    },
  };
}
