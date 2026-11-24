import type { PoolClient } from "pg";
import type { InvoicePreviewData } from "@/components/billing/invoice-renderer";
import { INDIAN_STATES } from "@/lib/constants/saas";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";
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
      `SELECT i.*, b.name AS branch_name, b.address AS branch_address, b.gstin AS branch_gstin,
              p.full_name AS creator_name, COALESCE(p.username, p.email) AS creator_login
       FROM public.invoices i
       JOIN public.branches b ON b.id = i.branch_id
       LEFT JOIN public.profiles p ON p.id = i.created_by
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, tenant.id]
    ),
    client.query("SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2", [invoiceId, tenant.id]),
    client.query<BillTemplateRow>(
      "SELECT * FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC LIMIT 1",
      [tenant.id]
    ),
  ]);
  if (invRes.rows.length === 0) return null;
  const inv = invRes.rows[0];
  const template = tplRes.rows[0];
  const stateCode: string | undefined = inv.customer_snapshot?.state_code;

  return {
    invoiceId: inv.id,
    format: template?.format ?? "a4",
    config:
      template?.config ??
      ({
        header_title: tenant.name,
        header_subtitle: inv.branch_name,
        footer_note: "Thank you!",
        terms: "",
        accent_color: "#0284c7",
        show_logo: true,
        show_hsn: true,
        show_gst_summary: true,
        show_discount: true,
        show_custom_fields: false,
        show_upi_qr: false,
      } as BillTemplateConfig),
    data: {
      logoUrl:
        tenant.brand_config?.logo_pdf_data_url ||
        (tenant.brand_config?.logo_key ? getPublicAssetUrl(tenant.brand_config.logo_key) : null),
      builtBy: inv.creator_name
        ? `${inv.creator_name}${inv.creator_login ? ` (@${inv.creator_login})` : ""}`
        : null,
      invoiceNumber: inv.invoice_number || "DRAFT",
      invoiceType: inv.invoice_type,
      dateStr: new Date(inv.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      branchName: inv.branch_name,
      branchAddress: inv.branch_address,
      branchGstin: inv.branch_gstin,
      customerName: inv.customer_snapshot?.name || "Walk-In Customer",
      customerPhone: inv.customer_snapshot?.phone,
      customerGstin: inv.customer_snapshot?.gstin,
      customerAddress: inv.customer_snapshot?.address || null,
      placeOfSupply: stateCode
        ? INDIAN_STATES[stateCode]
          ? `${INDIAN_STATES[stateCode]} (${stateCode})`
          : stateCode
        : null,
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
        gst_rate: Number(it.gst_rate),
        line_total: Number(it.line_total),
      })),
    },
  };
}
