import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/auth/crypto";
import { query, withPlatformTx } from "@/lib/db";
import { isConfigured } from "@/lib/env";

export const runtime = "nodejs";

const MAX_PER_HOUR = 10;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isPhone = (v: string) =>
  /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 15;

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).optional(),
  model_code: z.string().trim().max(80).optional(),
  attrs: z.string().trim().max(160).optional(),
  qty: z.number().int().min(1).max(10000).default(1),
  price: z.number().nullable().optional(),
});

const storefrontEnquirySchema = z.object({
  slug: z.string().trim().min(1).max(120),
  customerName: z.string().trim().min(1, "Enter your name.").max(160),
  customerContact: z
    .string()
    .trim()
    .max(160)
    .refine((v) => isEmail(v) || isPhone(v), "Enter a valid phone number or email."),
  message: z.string().trim().max(1000).optional(),
  items: z.array(itemSchema).max(50).optional().default([]),
  source: z.enum(["catalogue", "storefront", "product"]).optional().default("catalogue"),
  channel: z.enum(["inbox", "whatsapp", "both"]).optional().default("inbox"),
  website: z.string().max(200).optional(), // Honeypot
});

export async function POST(request: NextRequest) {
  if (!request.headers.get("origin") || !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Enquiries are unavailable right now." }, { status: 503 });
  }

  const parsed = storefrontEnquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check your details." },
      { status: 400 }
    );
  }

  const { slug, customerName, customerContact, message, items, source, channel, website } = parsed.data;
  if (website) return NextResponse.json({ ok: true });

  const tRes = await query<{
    id: string;
    status: string;
    enquiries_enabled: boolean;
  }>("SELECT id, status, enquiries_enabled FROM public.resolve_public_catalogue($1)", [slug]);

  const tenant = tRes.rows[0];
  if (!tenant || tenant.status !== "active") {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }
  if (!tenant.enquiries_enabled) {
    return NextResponse.json({ error: "Enquiry inbox is not enabled for this business." }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex");

  try {
    const result = await withPlatformTx(async (client) => {
      const recent = await client.query<{ cnt: number }>(
        "SELECT COUNT(*)::int AS cnt FROM public.tenant_enquiries WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'",
        [ipHash]
      );
      if ((recent.rows[0]?.cnt ?? 0) >= MAX_PER_HOUR) {
        return { limited: true as const };
      }

      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.tenant_enquiries
           (tenant_id, customer_name, customer_contact, message, items, source, channel, ip_hash)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         RETURNING id`,
        [
          tenant.id,
          customerName,
          customerContact,
          message || null,
          JSON.stringify(items),
          source,
          channel,
          ipHash,
        ]
      );
      return { limited: false as const, id: ins.rows[0]?.id };
    });

    if (result.limited) {
      return NextResponse.json({ error: "Too many enquiries sent. Please try again later." }, { status: 429 });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch {
    return NextResponse.json({ error: "Could not send enquiry. Please try again." }, { status: 500 });
  }
}
