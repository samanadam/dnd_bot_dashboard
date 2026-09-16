// Fixed-window limiter kept in process memory. The bot enforces its own limits
// (60/min per token, 10/min on /recording/*); this one stops a single portal
// user, or a runaway client, from spending the shared token's budget for
// everyone. Per-instance only — good enough for a single-node deployment.

export type Limit = { max: number; windowMs: number };

type Window = { start: number; count: number };

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(private now: () => number = Date.now) {}

  /** Returns 0 when allowed, otherwise the seconds to wait. */
  take(key: string, limit: Limit): number {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= limit.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    if (window.count >= limit.max) {
      return Math.max(1, Math.ceil((window.start + limit.windowMs - now) / 1000));
    }
    window.count += 1;
    if (this.windows.size > 10_000) this.sweep(now, limit.windowMs);
    return 0;
  }

  private sweep(now: number, windowMs: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= windowMs) this.windows.delete(key);
    }
  }
}
