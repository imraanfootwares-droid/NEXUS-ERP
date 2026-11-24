import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  hashPassword,
  isSameOriginRequest,
  signSessionToken,
} from "@/lib/auth/crypto";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";
import { PERMISSION_DEFINITIONS, TIER_META } from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import type { VerticalKey } from "@/types/database";

export const runtime = "nodejs";

const signupSchema = z.object({
  businessName: z.string().min(2).max(120),
  verticalKey: z.enum(["footwear", "apparel", "electronics", "fmcg", "hardware"]),
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Database is not configured yet." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Please fill in all required fields." },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const cleanEmail = input.email.trim().toLowerCase();
    const baseSlug =
      input.businessName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workspace";

    const tierMeta = TIER_META.tier_1;
    const result = await withPlatformTx(async (client) => {
      const emailCheck = await client.query<{ id: string }>(
        "SELECT id FROM public.profiles WHERE LOWER(email) = $1 LIMIT 1",
        [cleanEmail]
      );
      if (emailCheck.rows.length > 0) {
        throw new Error("An account with this email already exists.");
      }

      const slugCheck = await client.query<{ id: string }>(
        "SELECT id FROM public.tenants WHERE slug = $1 LIMIT 1",
        [baseSlug]
      );
      const cleanSlug =
        slugCheck.rows.length > 0
          ? `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
          : baseSlug;

      const tRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, slug, vertical_key, tier, max_users, max_branches, max_storage_mb)
         VALUES ($1, $2, $3, 'tier_1', $4, $5, 250)
         RETURNING id`,
        [input.businessName.trim(), cleanSlug, input.verticalKey, tierMeta.maxUsers, tierMeta.maxBranches]
      );
      const tid = tRes.rows[0].id;

      for (const p of PERMISSION_DEFINITIONS) {
        for (const role of ["owner", "branch_admin", "worker"] as const) {
          await client.query(
            `INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
             VALUES ($1, $2, $3, $4)`,
            [tid, role, p.key, p[role]]
          );
        }
      }

      const preset = VERTICAL_PRESETS[input.verticalKey as VerticalKey];
      await client.query(
        "INSERT INTO public.uoms (tenant_id, code, allow_decimal) VALUES ($1, $2, $3)",
        [tid, preset.defaultUom, preset.allowDecimal]
      );

      const bRes = await client.query<{ id: string }>(
        `INSERT INTO public.branches (tenant_id, name, code, type, state_code, is_default)
         VALUES ($1, 'Main Branch', 'MAIN', 'retail', '27', true)
         RETURNING id`,
        [tid]
      );

      const pRes = await client.query<{ id: string }>(
        `INSERT INTO public.profiles (tenant_id, role, full_name, email, username, password_hash, must_change_password)
         VALUES ($1, 'owner', $2, $3, NULL, $4, false)
         RETURNING id`,
        [tid, input.fullName.trim(), cleanEmail, hashPassword(input.password)]
      );

      await client.query(
        "INSERT INTO public.user_branch_assignments (user_id, branch_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [pRes.rows[0].id, bRes.rows[0].id, tid]
      );

      return { userId: pRes.rows[0].id, tenantId: tid };
    });

    const token = await signSessionToken({
      sub: result.userId,
      tid: result.tenantId,
      role: "owner",
      pa: false,
      sv: 1,
    });

    const res = NextResponse.json({
      ok: true,
      redirectTo: "/dashboard",
      message: "Workspace created! Welcome to Nexus ERP.",
    });
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      request.nextUrl.protocol.replace(":", "");
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && proto === "https",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Signup failed." },
      { status: 400 }
    );
  }
}
