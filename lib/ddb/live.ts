// Live sync: the player switches it on in the extension, which then reports in every
// 30-60 s. No report for this long means the browser was closed or the extension stopped.
export const LIVE_TTL_MS = 150_000;

export const isLiveRow = (row: { live: number; seen_at: string } | undefined, nowIso: string): boolean =>
  row !== undefined && row.live === 1 && Date.parse(nowIso) - Date.parse(row.seen_at) <= LIVE_TTL_MS;
