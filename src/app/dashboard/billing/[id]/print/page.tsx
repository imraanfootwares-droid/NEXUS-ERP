import { notFound } from "next/navigation";
import { InvoiceRenderer, PrintShareToolbar } from "@/components/billing/invoice-renderer";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { BillTemplateRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [invRes, itemsRes, tplRes] = await Promise.all([
        client.query(
          `SELECT i.*, b.name AS branch_name, b.address AS branch_address, b.gstin AS branch_gstin
           FROM public.invoices i
           JOIN public.branches b ON b.id = i.branch_id
           WHERE i.id = $1 AND i.tenant_id = $2`,
          [id, ctx.tenant!.id]
        ),
        client.query("SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2", [
          id,
          ctx.tenant!.id,
        ]),
        client.query<BillTemplateRow>(
          "SELECT * FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC LIMIT 1",
          [ctx.tenant!.id]
        ),
      ]);
      if (invRes.rows.length === 0) return null;
      return { inv: invRes.rows[0], items: itemsRes.rows, template: tplRes.rows[0] };
    }
  );

  if (!data) notFound();

  const { inv, items, template } = data;

  return (
    <div className="space-y-4">
      <PrintShareToolbar
        backHref="/dashboard/billing"
        backLabel="← Back to Invoices"
        pdfUrl={`/api/documents/invoice/${inv.id}`}
        docTitle={inv.invoice_number || "Invoice"}
      />

      <InvoiceRenderer
        format={template?.format ?? "a4"}
        config={
          template?.config ?? {
            header_title: ctx.tenant.name,
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
          }
        }
        data={{
          invoiceNumber: inv.invoice_number || "DRAFT",
          invoiceType: inv.invoice_type,
          dateStr: new Date(inv.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          branchName: inv.branch_name,
          branchAddress: inv.branch_address,
          branchGstin: inv.branch_gstin,
          customerName: inv.customer_snapshot?.name || "Walk-In Customer",
          customerPhone: inv.customer_snapshot?.phone,
          customerGstin: inv.customer_snapshot?.gstin,
          taxableAmount: Number(inv.taxable_amount),
          cgstAmount: Number(inv.cgst_amount),
          sgstAmount: Number(inv.sgst_amount),
          igstAmount: Number(inv.igst_amount),
          roundOff: Number(inv.round_off),
          grandTotal: Number(inv.grand_total),
          paidAmount: Number(inv.paid_amount),
          dueAmount: Number(inv.due_amount),
          items: items.map((it) => ({
            product_name: it.product_name,
            sku: it.sku,
            hsn_code: it.hsn_code,
            qty: Number(it.qty),
            unit_price: Number(it.unit_price),
            gst_rate: Number(it.gst_rate),
            line_total: Number(it.line_total),
          })),
        }}
      />
    </div>
  );
}
