import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/auth/crypto";
import { withPlatformTx } from "@/lib/db";
import { isConfigured } from "@/lib/env";

export const runtime = "nodejs";

const MAX_PER_HOUR = 5;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = (v: string) => /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 15;

const enquirySchema = z.object({
  contact: z
    .string()
    .trim()
    .max(160)
    .refine((v) => isEmail(v) || isPhone(v), "Enter a valid email or phone number."),
  business: z.string().trim().min(2, "Enter your business name.").max(160),
  interest: z.string().trim().max(120).optional(),
  website: z.string().max(200).optional(), // Honeypot: real visitors never fill this.
});

export async function POST(request: NextRequest) {
  if (!request.headers.get("origin") || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Enquiries are unavailable right now." }, { status: 503 });
  }

  const parsed = enquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  }
  const { contact, business, interest, website } = parsed.data;
  if (website) return NextResponse.json({ ok: true });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex");

  try {
    const limited = await withPlatformTx(async (client) => {
      const recent = await client.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM public.landing_enquiries WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'",
        [ipHash]
      );
      if ((recent.rows[0]?.cnt ?? 0) >= MAX_PER_HOUR) return true;

      const duplicate = await client.query(
        `SELECT id FROM public.landing_enquiries
         WHERE LOWER(contact) = LOWER($1) AND LOWER(business) = LOWER($2) AND created_at > now() - interval '24 hours'
         LIMIT 1`,
        [contact, business]
      );
      if (duplicate.rows.length === 0) {
        await client.query(
          "INSERT INTO public.landing_enquiries (contact, business, interest, ip_hash) VALUES ($1, $2, $3, $4)",
          [contact, business, interest || null, ipHash]
        );
      }
      return false;
    });
    if (limited) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send your request. Please try again." }, { status: 500 });
  }
}
