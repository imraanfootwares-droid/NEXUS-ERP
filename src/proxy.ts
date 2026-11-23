import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "@/lib/auth/crypto";
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
    host.endsWith(".vercel.app");

  if (!isPlatformHost && !pathname.startsWith("/s/") && !pathname.startsWith("/dashboard") && !pathname.startsWith("/login")) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/s/${host}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // Route protection for /dashboard and /platform (except /platform/setup)
  if (pathname.startsWith("/dashboard") || (pathname.startsWith("/platform") && !pathname.startsWith("/platform/setup"))) {
    // Allow dev-only preview cookie to inspect all role UIs without a live backend
    if (isDevPreviewAllowed()) {
      const devRole = parseDevPreviewRole(request.cookies.get(DEV_ROLE_COOKIE)?.value);
      if (devRole) {
        if (pathname.startsWith("/platform") && devRole !== "platform_admin") {
          const dashUrl = request.nextUrl.clone();
          dashUrl.pathname = "/dashboard";
          return NextResponse.redirect(dashUrl);
        }
        return NextResponse.next();
      }
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const session = await verifySessionToken(token);
    if (!session) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith("/platform") && !session.pa) {
      const dashUrl = request.nextUrl.clone();
      dashUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashUrl);
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
      const res = NextResponse.next();
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        request.nextUrl.protocol.replace(":", "");
      res.cookies.set(SESSION_COOKIE_NAME, refreshed, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" && proto === "https",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
