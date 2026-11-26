import { NextResponse, type NextRequest } from "next/server";
import {
  IMPERSONATE_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth/crypto";
import { DEV_ROLE_COOKIE, isDevPreviewAllowed, parseDevPreviewRole } from "@/lib/dev/preview";
import { env } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  const appDomain = (env.NEXT_PUBLIC_APP_DOMAIN || "localhost").toLowerCase().split(":")[0];

  // Skip static assets & internal Next routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/icon.svg"
  ) {
    return NextResponse.next();
  }

  // Custom client domain rewrite (e.g. imraanfootwear.in -> /s/imraanfootwear.in)
  const isPlatformHost =
    host === appDomain ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".workers.dev");

  if (!isPlatformHost && !pathname.startsWith("/s/") && !pathname.startsWith("/dashboard") && !pathname.startsWith("/login") && !pathname.startsWith("/signup")) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/s/${host}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // Route protection for /dashboard and /platform (except /platform/setup)
  const isPlatformRoute = pathname.startsWith("/platform") && !pathname.startsWith("/platform/setup");
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (isDashboardRoute || isPlatformRoute) {
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-nexus-scope", isPlatformRoute ? "platform" : "tenant");

    // Allow dev-only preview cookie to inspect all role UIs without a live backend
    if (isDevPreviewAllowed()) {
      const devRole = parseDevPreviewRole(request.cookies.get(DEV_ROLE_COOKIE)?.value);
      if (devRole) {
        if (isPlatformRoute && devRole !== "platform_admin") {
          const dashUrl = request.nextUrl.clone();
          dashUrl.pathname = "/dashboard";
          return NextResponse.redirect(dashUrl);
        }
        return NextResponse.next({ request: { headers: reqHeaders } });
      }
    }

    let cookieName = isPlatformRoute ? PLATFORM_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
    let token = request.cookies.get(cookieName)?.value;

    // Support Super Admin impersonation into /dashboard without requiring a tenant login cookie
    if (isDashboardRoute && !token && request.cookies.get(IMPERSONATE_COOKIE_NAME)?.value) {
      cookieName = PLATFORM_SESSION_COOKIE_NAME;
      token = request.cookies.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
    }

    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      if (isPlatformRoute) loginUrl.searchParams.set("portal", "super");
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const session = await verifySessionToken(token);
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      if (isPlatformRoute) loginUrl.searchParams.set("portal", "super");
      return NextResponse.redirect(loginUrl);
    }

    if (isPlatformRoute && !session.pa) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("portal", "super");
      return NextResponse.redirect(loginUrl);
    }

    // Sliding 12h JWT refresh when < 6h remain
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.exp && session.exp - nowSec < 6 * 3600) {
      const refreshed = await signSessionToken({
        sub: session.sub,
        tid: session.tid,
        role: session.role,
        pa: session.pa,
        sv: session.sv,
      });
      const res = NextResponse.next({ request: { headers: reqHeaders } });
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        request.nextUrl.protocol.replace(":", "");
      res.cookies.set(cookieName, refreshed, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" && proto === "https",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      return res;
    }

    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
