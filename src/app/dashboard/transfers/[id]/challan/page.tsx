import { notFound } from "next/navigation";
import { PrintShareToolbar } from "@/components/billing/invoice-renderer";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TransferChallanPage({
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
      const items = await client.query(
        `SELECT sti.*, pv.sku, p.name AS product_name
         FROM public.stock_transfer_items sti
         JOIN public.product_variants pv ON pv.id = sti.variant_id
         JOIN public.products p ON p.id = pv.product_id
         WHERE sti.transfer_id = $1 AND sti.tenant_id = $2`,
        [id, ctx.tenant!.id]
      );
      return { tr: trRes.rows[0], items: items.rows };
    }
  );

  if (!data) notFound();
  const { tr, items } = data;
  const isTaxInvoice = tr.doc_type === "branch_transfer_invoice";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <PrintShareToolbar
        backHref="/dashboard/operations"
        backLabel="← Back to Operations"
        pdfUrl={`/api/documents/challan/${tr.id}`}
        docTitle={tr.doc_number || "Challan"}
      />

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-sm">
        <div className="flex justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold">{ctx.tenant.name}</h2>
            <p className="text-xs text-slate-500">
              {isTaxInvoice ? "BRANCH TRANSFER TAX INVOICE (IGST)" : "STOCK TRANSFER DELIVERY CHALLAN"}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-base">{tr.doc_number}</p>
            <p>Status: {tr.status}</p>
            {tr.eway_bill_no && <p>E-Way Bill: {tr.eway_bill_no}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-bold text-slate-500 uppercase">From (Dispatch)</p>
            <p className="font-semibold text-slate-900 mt-1">{tr.from_name}</p>
            <p className="text-slate-600">{tr.from_addr || ""}</p>
            {tr.from_gstin && <p>GSTIN: {tr.from_gstin}</p>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-bold text-slate-500 uppercase">To (Destination)</p>
            <p className="font-semibold text-slate-900 mt-1">{tr.to_name}</p>
            <p className="text-slate-600">{tr.to_addr || ""}</p>
            {tr.to_gstin && <p>GSTIN: {tr.to_gstin}</p>}
          </div>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead className="border-y border-slate-300 bg-slate-50">
            <tr>
              <th className="py-2 px-2">Item / SKU</th>
              <th className="py-2 px-2 text-right">Sent</th>
              <th className="py-2 px-2 text-right">Received</th>
              <th className="py-2 px-2 text-right">Rate</th>
              <th className="py-2 px-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 px-2 font-medium">{it.product_name} ({it.sku})</td>
                <td className="py-2 px-2 text-right">{it.qty_sent}</td>
                <td className="py-2 px-2 text-right">{it.qty_received}</td>
                <td className="py-2 px-2 text-right">₹{Number(it.transfer_price).toFixed(2)}</td>
                <td className="py-2 px-2 text-right">₹{(Number(it.qty_sent) * Number(it.transfer_price)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-right text-xs space-y-1 border-t border-slate-200 pt-3">
          <p>Transfer Value: <strong>₹{Number(tr.transfer_value).toLocaleString("en-IN")}</strong></p>
          {isTaxInvoice && <p>IGST: <strong>₹{Number(tr.igst_amount).toLocaleString("en-IN")}</strong></p>}
        </div>
      </div>
    </div>
  );
}
