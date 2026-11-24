import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  IMPERSONATE_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  hashPassword,
  isSameOriginRequest,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth/crypto";
import { DEV_ROLE_COOKIE } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { query, withPlatformTx } from "@/lib/db";
import type { TenantRole } from "@/lib/constants/saas";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

const resetRequestSchema = z.object({
  action: z.literal("request_reset"),
  identifier: z.string().min(1),
  tenantSlug: z.string().optional(),
  note: z.string().max(300).optional(),
});

const changePasswordSchema = z.object({
  action: z.literal("change_password"),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

function isHttpsRequest(request: NextRequest): boolean {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    request.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

function setSessionCookie(
  res: NextResponse,
  token: string,
  request: NextRequest,
  isPlatformAdmin: boolean
) {
  const cookieName = isPlatformAdmin ? PLATFORM_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && isHttpsRequest(request),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

function detectRequestScope(request: NextRequest): "platform" | "tenant" {
  const param = request.nextUrl.searchParams.get("scope");
  if (param === "platform" || param === "tenant") return param;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).pathname.startsWith("/platform")) return "platform";
    } catch {
      // ignore malformed referer
    }
  }
  return "tenant";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Database is not configured yet." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
    }

    const { identifier, password, tenantSlug } = parsed.data;
    const found = await query<{
      id: string;
      tenant_id: string | null;
      is_platform_admin: boolean;
      role: TenantRole;
      full_name: string;
      email: string | null;
      username: string | null;
      password_hash: string;
      session_version: number;
      failed_login_count: number;
      locked_until: string | null;
      must_change_password: boolean;
      is_active: boolean;
      tenant_status: string | null;
    }>("SELECT * FROM public.auth_find_user($1, $2)", [identifier, tenantSlug ?? null]);

    if (found.rows.length > 1) {
      return NextResponse.json(
        { error: "Multiple accounts match that username. Please enter business-slug/username or email." },
        { status: 400 }
      );
    }

    const user = found.rows[0];
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please wait 15 minutes or request a password reset." },
        { status: 429 }
      );
    }

    const validPw = verifyPassword(password, user.password_hash);
    if (!validPw) {
      await query("SELECT public.auth_record_login_attempt($1, false)", [user.id]);
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: "Account is deactivated. Contact your administrator." }, { status: 403 });
    }

    await query("SELECT public.auth_record_login_attempt($1, true)", [user.id]);

    if (user.tenant_status === "suspended" && !user.is_platform_admin) {
      return NextResponse.json({ redirectTo: "/suspended", suspended: true }, { status: 403 });
    }

    const token = await signSessionToken({
      sub: user.id,
      tid: user.tenant_id,
      role: user.role,
      pa: user.is_platform_admin,
      sv: user.session_version,
    });

    const redirectTo = user.is_platform_admin ? "/platform" : "/dashboard";
    const res = NextResponse.json({
      ok: true,
      redirectTo,
      mustChangePassword: user.must_change_password,
    });
    setSessionCookie(res, token, request, user.is_platform_admin);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json();

    if (body?.action === "request_reset") {
      const parsed = resetRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid reset request." }, { status: 400 });
      }
      const { identifier, tenantSlug, note } = parsed.data;
      const genericMsg = "If the account exists, your administrator has been notified.";

      await withPlatformTx(async (client) => {
        const rateRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM public.password_reset_requests
           WHERE LOWER(identifier_submitted) = LOWER($1) AND created_at > now() - interval '1 hour'`,
          [identifier]
        );
        if (Number(rateRes.rows[0]?.cnt ?? 0) >= 3) {
          return;
        }

        const userRes = await client.query<{ id: string; tenant_id: string | null }>(
          "SELECT id, tenant_id FROM public.auth_find_user($1, $2) LIMIT 1",
          [identifier, tenantSlug ?? null]
        );
        const match = userRes.rows[0];
        if (!match) return;

        await client.query(
          `INSERT INTO public.password_reset_requests (tenant_id, user_id, identifier_submitted, note, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [match.tenant_id, match.id, identifier, note ?? null]
        );
      });

      return NextResponse.json({ ok: true, message: genericMsg });
    }

    if (body?.action === "change_password") {
      const parsed = changePasswordSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
      }
      const reqScope = detectRequestScope(request);
      const token = request.cookies.get(
        reqScope === "platform" ? PLATFORM_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME
      )?.value;
      const jwt = token ? await verifySessionToken(token) : null;
      if (!jwt) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const newToken = await withPlatformTx(async (client) => {
        const profRes = await client.query<{
          id: string;
          tenant_id: string | null;
          role: TenantRole;
          is_platform_admin: boolean;
          username: string | null;
          password_hash: string;
          session_version: number;
        }>("SELECT id, tenant_id, role, is_platform_admin, username, password_hash, session_version FROM public.profiles WHERE id = $1 FOR UPDATE", [
          jwt.sub,
        ]);
        const p = profRes.rows[0];
        if (!p || !verifyPassword(parsed.data.currentPassword, p.password_hash)) {
          throw new Error("Current password is incorrect.");
        }
        if (p.username && parsed.data.newPassword.toLowerCase() === p.username.toLowerCase()) {
          throw new Error("Password cannot match your username.");
        }

        const nextSv = p.session_version + 1;
        await client.query(
          `UPDATE public.profiles
           SET password_hash = $1, must_change_password = false, session_version = $2
           WHERE id = $3`,
          [hashPassword(parsed.data.newPassword), nextSv, p.id]
        );

        return signSessionToken({
          sub: p.id,
          tid: p.tenant_id,
          role: p.role,
          pa: p.is_platform_admin,
          sv: nextSv,
        });
      });

      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, newToken, request, jwt.pa);
      return res;
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const reqScope = detectRequestScope(request);
  const res = NextResponse.json({ ok: true });
  if (reqScope === "platform") {
    res.cookies.delete(PLATFORM_SESSION_COOKIE_NAME);
    res.cookies.delete(IMPERSONATE_COOKIE_NAME);
  } else {
    res.cookies.delete(SESSION_COOKIE_NAME);
    res.cookies.delete(DEV_ROLE_COOKIE);
  }
  return res;
}
