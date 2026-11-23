import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/lib/env";
import {
  DEV_ROLE_COOKIE,
  isDevPreviewAllowed,
  parseDevPreviewRole,
} from "@/lib/dev/preview";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isDevPreviewAllowed()) {
    return NextResponse.json({ allowed: false, activeRole: null, dbConfigured: isConfigured.db });
  }
  const activeRole = parseDevPreviewRole(request.cookies.get(DEV_ROLE_COOKIE)?.value);
  return NextResponse.json({
    allowed: true,
    activeRole,
    dbConfigured: isConfigured.db,
  });
}

export async function POST(request: NextRequest) {
  if (!isDevPreviewAllowed()) {
    return NextResponse.json({ error: "Dev preview is disabled in production." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const role = parseDevPreviewRole(body?.role);

  const res = NextResponse.json({ ok: true, activeRole: role });
  if (!role) {
    res.cookies.delete(DEV_ROLE_COOKIE);
  } else {
    res.cookies.set(DEV_ROLE_COOKIE, role, {
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return res;
}
