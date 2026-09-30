// The public demo lives under /demo and mirrors every portal page with made-up
// data. Nothing under it signs anyone in, reads the database or reaches the bot:
// the browser clients answer from an in-memory store instead (lib/demo/*).

export const DEMO_BASE = "/demo";

/** True for /demo and anything below it, never for /demonstration or /demo-x. */
export function isDemoPath(pathname: string): boolean {
  return pathname === DEMO_BASE || pathname.startsWith(`${DEMO_BASE}/`);
}

/** Whether this browser tab is showing the demo. Always false on the server. */
export function inDemo(): boolean {
  return typeof window !== "undefined" && isDemoPath(window.location.pathname);
}

/** The portal path a demo path stands for: /demo/dm/npcs is /dm/npcs, /demo is /. */
export function stripBase(pathname: string): string {
  if (!isDemoPath(pathname)) return pathname;
  return pathname.slice(DEMO_BASE.length) || "/";
}

/** Puts an in-portal path under the demo when the demo is showing. */
export function withBase(href: string, demo: boolean): string {
  if (!demo || !href.startsWith("/") || href.startsWith("//") || isDemoPath(href)) return href;
  return href === "/" ? DEMO_BASE : `${DEMO_BASE}${href}`;
}
