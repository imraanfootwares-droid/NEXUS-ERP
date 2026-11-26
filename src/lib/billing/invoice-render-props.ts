import type { PoolClient } from "pg";
import type { InvoicePreviewData } from "@/components/billing/invoice-renderer";
import {
  buildDefaultConfigForCategory,
  resolveSellerProfile,
  selectTemplateForBill,
} from "@/lib/billing/seller-profile";
import { INDIAN_STATES } from "@/lib/constants/saas";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";
import { resolveEffectiveLogoUrl } from "@/lib/storage/logo-data-url";
import type { BillTemplateConfig, BillTemplateRow, TenantRow } from "@/types/database";

export interface InvoiceRenderProps {
  invoiceId: string;
  format: BillTemplateRow["format"];
  config: BillTemplateConfig;
  data: InvoicePreviewData;
}

/** Loads everything the bill design needs. Shared by the Print page and the Preview popup. */
export async function loadInvoiceRenderProps(
  client: PoolClient,
  tenant: TenantRow,
  invoiceId: string
): Promise<InvoiceRenderProps | null> {
  const [invRes, itemsRes, tplRes] = await Promise.all([
    client.query(
      `SELECT i.*, b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone, b.gstin AS branch_gstin,
              p.full_name AS creator_name, COALESCE(p.username, p.email) AS creator_login
       FROM public.invoices i
       JOIN public.branches b ON b.id = i.branch_id
       LEFT JOIN public.profiles p ON p.id = i.created_by
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, tenant.id]
    ),
    client.query("SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2", [invoiceId, tenant.id]),
    client.query<BillTemplateRow>(
      "SELECT * FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC",
      [tenant.id]
    ),
  ]);
  if (invRes.rows.length === 0) return null;
  const inv = invRes.rows[0];
  const stateCode: string | undefined = inv.customer_snapshot?.state_code;

  const hasGst =
    inv.invoice_type !== "estimate_bill_of_supply" &&
    (Number(inv.cgst_amount) > 0 ||
      Number(inv.sgst_amount) > 0 ||
      Number(inv.igst_amount) > 0 ||
      itemsRes.rows.some((it) => Number(it.gst_rate || 0) > 0));

  const seller = resolveSellerProfile(tenant, {
    name: inv.branch_name,
    address: inv.branch_address,
    phone: inv.branch_phone,
    gstin: inv.branch_gstin,
  });

  const template = selectTemplateForBill(tplRes.rows, hasGst);
  const fallbackCfg = buildDefaultConfigForCategory(
    hasGst ? "gst" : "normal",
    seller,
    tenant.brand_config?.primary_color
  );
  const mergedConfig: BillTemplateConfig = {
    ...fallbackCfg,
    ...(template?.config ?? {}),
    bill_category: hasGst ? "gst" : "normal",
    show_gst_summary: hasGst ? template?.config?.show_gst_summary ?? true : false,
  };

  return {
    invoiceId: inv.id,
    format: template?.format ?? "a4",
    config: mergedConfig,
    data: {
      logoUrl: resolveEffectiveLogoUrl({
        perBillOverride:
          (inv.customer_snapshot as { custom_logo_data_url?: string | null } | null)?.custom_logo_data_url ?? null,
        templateOverride: mergedConfig.custom_logo_data_url ?? null,
        profileDefault:
          tenant.brand_config?.logo_pdf_data_url ||
          (tenant.brand_config?.logo_key ? getPublicAssetUrl(tenant.brand_config.logo_key) : null),
      }),
      builtBy: inv.creator_name
        ? `${inv.creator_name}${inv.creator_login ? ` (@${inv.creator_login})` : ""}`
        : null,
      invoiceNumber: inv.invoice_number || "DRAFT",
      invoiceType: inv.invoice_type,
      dateStr: new Date(inv.created_at).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).replace(/\//g, "-"),
      sellerName: seller.businessName,
      sellerAddress: seller.address,
      sellerPhone: seller.phone,
      sellerEmail: seller.email,
      sellerGstin: seller.gstin,
      signatoryName: seller.signatoryName,
      bankDetails: seller.bankDetails,
      branchName: inv.branch_name,
      branchAddress: inv.branch_address,
      branchGstin: inv.branch_gstin,
      customerName: inv.customer_snapshot?.name || "Walk-In Customer",
      customerPhone: inv.customer_snapshot?.phone,
      customerGstin: inv.customer_snapshot?.gstin,
      customerAddress: inv.customer_snapshot?.address || null,
      shipToName: inv.customer_snapshot?.ship_to_name || null,
      shipToAddress: inv.customer_snapshot?.ship_to_address || null,
      placeOfSupply: stateCode
        ? INDIAN_STATES[stateCode]
          ? `${INDIAN_STATES[stateCode]} (${stateCode})`
          : stateCode
        : null,
      subtotal: Number(inv.subtotal ?? 0),
      discountAmount: Number(inv.discount_amount ?? 0),
      taxableAmount: Number(inv.taxable_amount),
      cgstAmount: Number(inv.cgst_amount),
      sgstAmount: Number(inv.sgst_amount),
      igstAmount: Number(inv.igst_amount),
      roundOff: Number(inv.round_off),
      grandTotal: Number(inv.grand_total),
      paidAmount: Number(inv.paid_amount),
      dueAmount: Number(inv.due_amount),
      items: itemsRes.rows.map((it) => ({
        product_name: it.product_name,
        sku: it.sku,
        hsn_code: it.hsn_code,
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        taxable_value: Number(it.taxable_value),
        gst_rate: Number(it.gst_rate),
        line_total: Number(it.line_total),
      })),
    },
  };
}
