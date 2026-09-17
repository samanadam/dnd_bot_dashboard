// Request checks shared by every portal API route: the bot proxy and the DM
// tools. Kept free of Next.js imports so they are unit-tested directly.

// Sent by the portal's own fetch calls. A custom header forces a CORS preflight
// for any cross-site attempt, which is never answered.
export const PORTAL_HEADER = "x-portal-request";

export function errorResponse(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

// Stops CSRF, including from other subdomains of the same site.
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  // Older browsers: fall back to comparing Origin with Host.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Reads a body without ever buffering more than `limit` bytes.
export async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
