import { NextResponse, type NextRequest } from "next/server";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { INDIAN_STATES } from "@/lib/constants/saas";
import { withTenantTx } from "@/lib/db";
import { renderCataloguePdfBuffer, renderChallanPdfBuffer, renderInvoicePdfBuffer } from "@/lib/pdf/documents";
import { fetchImageForPdf } from "@/lib/pdf/image-helper";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await context.params;
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (type === "invoice") {
    try {
      assertAccess(ctx, "billing.view");
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden" }, { status: 403 });
    }

    const invData = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const [invRes, itemsRes, tplRes] = await Promise.all([
          client.query(
            `SELECT i.*, b.name AS branch_name, b.address AS branch_address, b.gstin AS branch_gstin,
                    p.full_name AS creator_name, COALESCE(p.username, p.email) AS creator_login
             FROM public.invoices i
             JOIN public.branches b ON b.id = i.branch_id
             LEFT JOIN public.profiles p ON p.id = i.created_by
             WHERE i.id = $1 AND i.tenant_id = $2`,
            [id, ctx.tenant!.id]
          ),
          client.query(
            "SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2",
            [id, ctx.tenant!.id]
          ),
          client.query<{
            config: {
              show_logo?: boolean;
              show_hsn?: boolean;
              show_gst_summary?: boolean;
              accent_color?: string;
              terms?: string;
            };
          }>(
            "SELECT config FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC LIMIT 1",
            [ctx.tenant!.id]
          ),
        ]);
        if (invRes.rows.length === 0) return null;
        return { inv: invRes.rows[0], items: itemsRes.rows, tpl: tplRes.rows[0]?.config ?? null };
      }
    );

    if (!invData) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const { inv, items, tpl } = invData;
    const showLogo = tpl?.show_logo ?? true;
    const rawLogoKey = ctx.tenant.brand_config?.logo_key ?? null;
    const logoSource =
      ctx.tenant.brand_config?.logo_pdf_data_url ||
      (rawLogoKey ? getPublicAssetUrl(rawLogoKey) : null);
    const pdfSafeLogo = showLogo ? await fetchImageForPdf(logoSource, { format: "png", maxDim: 160 }) : null;
    const builtBy = inv.creator_name
      ? `${inv.creator_name}${inv.creator_login ? ` (@${inv.creator_login})` : ""}`
      : null;

    const pdf = await renderInvoicePdfBuffer({
      tenantName: ctx.tenant.name,
      logoUrl: showLogo ? pdfSafeLogo : null,
      accentColor: tpl?.accent_color || ctx.tenant.brand_config?.primary_color || null,
      branchName: inv.branch_name,
      branchAddress: inv.branch_address,
      branchGstin: inv.branch_gstin,
      invoiceNumber: inv.invoice_number || "DRAFT",
      invoiceType: inv.invoice_type,
      createdAt: inv.created_at,
      builtBy,
      customerName: inv.customer_snapshot?.name || "Walk-In Customer",
      customerPhone: inv.customer_snapshot?.phone,
      customerGstin: inv.customer_snapshot?.gstin,
      customerAddress: inv.customer_snapshot?.address || null,
      placeOfSupply: inv.customer_snapshot?.state_code
        ? INDIAN_STATES[inv.customer_snapshot.state_code]
          ? `${INDIAN_STATES[inv.customer_snapshot.state_code]} (${inv.customer_snapshot.state_code})`
          : inv.customer_snapshot.state_code
        : null,
      supplyType: inv.supply_type,
      subtotal: Number(inv.subtotal),
      discountAmount: Number(inv.discount_amount),
      taxableAmount: Number(inv.taxable_amount),
      cgstAmount: Number(inv.cgst_amount),
      sgstAmount: Number(inv.sgst_amount),
      igstAmount: Number(inv.igst_amount),
      roundOff: Number(inv.round_off),
      grandTotal: Number(inv.grand_total),
      paidAmount: Number(inv.paid_amount),
      dueAmount: Number(inv.due_amount),
      terms: tpl?.terms || undefined,
      showHsn: tpl?.show_hsn ?? true,
      showGst: tpl?.show_gst_summary ?? true,
      items: items.map((it) => ({
        product_name: it.product_name,
        sku: it.sku,
        hsn_code: it.hsn_code,
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        gst_rate: Number(it.gst_rate),
        line_total: Number(it.line_total),
      })),
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(inv.invoice_number || "invoice").replace(/\//g, "-")}.pdf"`,
      },
    });
  }

  if (type === "challan") {
    try {
      assertAccess(ctx, "transfers.receive");
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden" }, { status: 403 });
    }

    const trData = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const trRes = await client.query(
          `SELECT st.*, fb.name AS from_name, fb.address AS from_addr, fb.gstin AS from_gstin,
                  tb.name AS to_name, tb.address AS to_addr, tb.gstin AS to_gstin
           FROM public.stock_transfers st
           JOIN public.branches fb ON fb.id = st.from_branch_id
           JOIN public.branches tb ON tb.id = st.to_branch_id
           WHERE st.id = $1 AND st.tenant_id = $2`,
          [id, ctx.tenant!.id]
        );
        if (trRes.rows.length === 0) return null;
        const itemsRes = await client.query(
          `SELECT sti.*, pv.sku, p.name AS product_name
           FROM public.stock_transfer_items sti
           JOIN public.product_variants pv ON pv.id = sti.variant_id
           JOIN public.products p ON p.id = pv.product_id
           WHERE sti.transfer_id = $1 AND sti.tenant_id = $2`,
          [id, ctx.tenant!.id]
        );
        return { tr: trRes.rows[0], items: itemsRes.rows };
      }
    );

    if (!trData) return NextResponse.json({ error: "Transfer document not found" }, { status: 404 });

    const { tr, items } = trData;
    const pdf = await renderChallanPdfBuffer({
      tenantName: ctx.tenant.name,
      docNumber: tr.doc_number,
      docType: tr.doc_type,
      status: tr.status,
      createdAt: tr.created_at,
      fromName: tr.from_name,
      fromAddress: tr.from_addr,
      fromGstin: tr.from_gstin,
      toName: tr.to_name,
      toAddress: tr.to_addr,
      toGstin: tr.to_gstin,
      transportName: tr.transport_name,
      lrNumber: tr.lr_number,
      vehicleNo: tr.vehicle_no,
      ewayBillNo: tr.eway_bill_no,
      transferValue: Number(tr.transfer_value),
      igstAmount: Number(tr.igst_amount),
      items: items.map((it) => ({
        product_name: it.product_name,
        sku: it.sku,
        qty_sent: Number(it.qty_sent),
        qty_received: Number(it.qty_received),
        transfer_price: Number(it.transfer_price),
      })),
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${String(tr.doc_number || "challan").replace(/\//g, "-")}.pdf"`,
      },
    });
  }

  if (type === "catalogue") {
    try {
      assertAccess(ctx, "catalogue.export");
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden" }, { status: 403 });
    }
    const onlyNew = request.nextUrl.searchParams.get("new_only") === "1";
    const priceMode = (request.nextUrl.searchParams.get("price") || ctx.tenant.storefront_config?.catalogue_price_display || "retail") as
      | "retail"
      | "wholesale"
      | "hide";
    const title = request.nextUrl.searchParams.get("title") || "New Arrivals Catalogue";

    const rows = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          model_code: string;
          category: string | null;
          brand: string | null;
          description: string | null;
          is_new_arrival: boolean;
          custom_fields: Record<string, unknown> | null;
          primary_image_key: string | null;
          selling_price: string | null;
          wholesale_price: string | null;
          sizes: string[];
        }>(
          `SELECT p.id, p.name, p.model_code, p.category, p.brand, p.description,
                  p.is_new_arrival, p.custom_fields, p.primary_image_key,
                  MIN(pv.selling_price)::text AS selling_price,
                  MIN(pv.wholesale_price)::text AS wholesale_price,
                  COALESCE(
                    ARRAY_AGG(DISTINCT NULLIF(TRIM(pv.attributes->>'size'), ''))
                      FILTER (WHERE NULLIF(TRIM(pv.attributes->>'size'), '') IS NOT NULL),
                    '{}'::text[]
                  ) AS sizes
           FROM public.products p
           LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
           WHERE p.tenant_id = $1 AND p.is_active = true
             ${onlyNew ? "AND p.is_new_arrival = true" : ""}
           GROUP BY p.id
           ORDER BY p.is_new_arrival DESC, p.updated_at DESC
           LIMIT 150`,
          [ctx.tenant!.id]
        );
        return res.rows;
      }
    );

    const cfg = ctx.tenant.storefront_config;
    const logoRaw =
      ctx.tenant.brand_config?.logo_pdf_data_url ||
      (ctx.tenant.brand_config?.logo_key ? getPublicAssetUrl(ctx.tenant.brand_config.logo_key) : null);
    const [logoDataUri, productImages] = await Promise.all([
      fetchImageForPdf(logoRaw, { format: "png", maxDim: 160 }),
      Promise.all(
        rows.map(async (r) => {
          if (!r.primary_image_key) return null;
          const thumbUrl = getPublicAssetUrl(deriveThumbKey(r.primary_image_key));
          const converted = await fetchImageForPdf(thumbUrl, { format: "jpeg", maxDim: 420 });
          if (converted) return converted;
          return fetchImageForPdf(getPublicAssetUrl(r.primary_image_key), { format: "jpeg", maxDim: 420 });
        })
      ),
    ]);

    const pdf = await renderCataloguePdfBuffer({
      tenantName: ctx.tenant.name,
      logoUrl: logoDataUri,
      title: title.replace(/\u2014/g, "-"),
      subtitle: (cfg?.hero_subtitle || "").replace(/\u2014/g, "-"),
      whatsapp: cfg?.whatsapp_number || "",
      catalogueUrl: `${request.nextUrl.origin}/s/${ctx.tenant.slug}`,
      priceLabel: priceMode === "wholesale" ? "Wholesale" : priceMode === "hide" ? "Hide" : "Retail",
      items: rows.map((r, idx) => {
        const rawCarton = Number(r.custom_fields?.pcs_per_carton ?? 0);
        return {
          name: r.name,
          modelCode: r.model_code,
          category: r.category,
          brand: (cfg?.show_brand ?? true) ? r.brand : null,
          description: (cfg?.show_description ?? true) ? r.description : null,
          isNewArrival: r.is_new_arrival,
          pcsPerCarton: (cfg?.show_carton_info ?? true) && Number.isFinite(rawCarton) && rawCarton > 0 ? rawCarton : null,
          sizes: (cfg?.show_sizes ?? true) && r.sizes?.length ? r.sizes.slice(0, 8).join(", ") : undefined,
          imageUrl: productImages[idx] ?? null,
          price:
            priceMode === "hide"
              ? null
              : Number(priceMode === "wholesale" ? r.wholesale_price : r.selling_price) || 0,
        };
      }),
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ctx.tenant.slug}-catalogue.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Unsupported document type" }, { status: 400 });
}
