import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";

// Runs before every page render: sets a per-request nonce CSP and bounces
// signed-out visitors to /signin. This is the optimistic first gate only —
// pages and /api/bot re-check the session themselves.

const PUBLIC_PATHS = new Set(["/signin"]);

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes only; no remote stylesheets.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://discord.com",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const handler = auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (!request.auth && !PUBLIC_PATHS.has(pathname)) {
    const target = new URL("/signin", request.nextUrl.origin);
    // Same-origin relative path only, so this cannot become an open redirect.
    if (pathname !== "/") target.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
});

type Wrapped = (request: NextRequest, event: NextFetchEvent) => Promise<Response | undefined>;

// With a lazily-built config, Auth.js's auth(wrapper) resolves to the wrapped
// handler asynchronously (its types say otherwise), hence the await.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const wrapped = (await (handler as unknown as Promise<Wrapped>)) as Wrapped;
  return wrapped(request, event);
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
