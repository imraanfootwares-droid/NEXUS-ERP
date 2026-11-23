import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const { type } = await context.params;
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertAccess(ctx, "reports.export_gst");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden" }, { status: 403 });
  }
  const from = request.nextUrl.searchParams.get("from") || "2000-01-01";
  const to = request.nextUrl.searchParams.get("to") || "2099-12-31";
  const format = request.nextUrl.searchParams.get("format") || "xlsx";

  const rows = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      if (type === "sales_register" || type === "gstr1") {
        const res = await client.query(
          `SELECT i.invoice_number, i.invoice_type, (i.created_at AT TIME ZONE 'Asia/Kolkata')::date AS invoice_date,
                  i.customer_snapshot->>'name' AS customer_name,
                  i.customer_snapshot->>'gstin' AS customer_gstin,
                  i.supply_type, i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.grand_total, i.status
           FROM public.invoices i
           WHERE i.tenant_id = $1 AND i.status <> 'draft'
             AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
           ORDER BY i.created_at DESC`,
          [ctx.tenant!.id, from, to]
        );
        return res.rows;
      }

      if (type === "purchase_register") {
        const res = await client.query(
          `SELECT po.bill_number, s.name AS supplier_name, s.gstin AS supplier_gstin, po.purchase_type,
                  po.total_amount, po.itc_cgst, po.itc_sgst, po.itc_igst, po.paid_amount,
                  (po.created_at AT TIME ZONE 'Asia/Kolkata')::date AS bill_date
           FROM public.purchase_orders po
           JOIN public.suppliers s ON s.id = po.supplier_id
           WHERE po.tenant_id = $1
             AND (po.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
           ORDER BY po.created_at DESC`,
          [ctx.tenant!.id, from, to]
        );
        return res.rows;
      }

      if (type === "hsn_summary") {
        const res = await client.query(
          `SELECT COALESCE(ii.hsn_code, 'NA') AS hsn_code, ii.gst_rate,
                  SUM(ii.qty) AS total_qty, SUM(ii.taxable_value) AS taxable_value,
                  SUM(ii.cgst) AS cgst, SUM(ii.sgst) AS sgst, SUM(ii.igst) AS igst, SUM(ii.line_total) AS total_value
           FROM public.invoice_items ii
           JOIN public.invoices i ON i.id = ii.invoice_id
           WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','cancelled')
             AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
           GROUP BY 1, 2
           ORDER BY 1, 2`,
          [ctx.tenant!.id, from, to]
        );
        return res.rows;
      }

      if (type === "stock_valuation") {
        const res = await client.query(
          `SELECT b.name AS branch, p.model_code, p.name AS product, pv.sku, pv.attributes,
                  bs.quantity, pv.avg_cost, (bs.quantity * pv.avg_cost) AS stock_value
           FROM public.branch_stock bs
           JOIN public.branches b ON b.id = bs.branch_id
           JOIN public.product_variants pv ON pv.id = bs.variant_id
           JOIN public.products p ON p.id = pv.product_id
           WHERE bs.tenant_id = $1 AND bs.quantity <> 0
           ORDER BY b.name, p.model_code`,
          [ctx.tenant!.id]
        );
        return res.rows;
      }

      if (type === "eway_json") {
        const [invRes, trRes] = await Promise.all([
          client.query(
            `SELECT i.invoice_number AS doc_no, 'INV' AS doc_type,
                    (i.created_at AT TIME ZONE 'Asia/Kolkata')::date AS doc_date,
                    b.gstin AS from_gstin, b.state_code AS from_state,
                    i.customer_snapshot->>'name' AS to_name,
                    i.customer_snapshot->>'gstin' AS to_gstin,
                    i.customer_snapshot->>'state_code' AS to_state,
                    i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.grand_total, i.eway_bill_no
             FROM public.invoices i
             JOIN public.branches b ON b.id = i.branch_id
             WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','cancelled')
               AND i.grand_total >= 50000
               AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
             ORDER BY i.created_at DESC`,
            [ctx.tenant!.id, from, to]
          ),
          client.query(
            `SELECT st.doc_number AS doc_no,
                    CASE WHEN st.doc_type = 'branch_transfer_invoice' THEN 'INV' ELSE 'CHL' END AS doc_type,
                    (st.created_at AT TIME ZONE 'Asia/Kolkata')::date AS doc_date,
                    fb.gstin AS from_gstin, fb.state_code AS from_state,
                    tb.name AS to_name, tb.gstin AS to_gstin, tb.state_code AS to_state,
                    st.transfer_value AS taxable_amount, 0 AS cgst_amount, 0 AS sgst_amount,
                    st.igst_amount, (st.transfer_value + st.igst_amount) AS grand_total, st.eway_bill_no,
                    st.transport_name, st.lr_number, st.vehicle_no
             FROM public.stock_transfers st
             JOIN public.branches fb ON fb.id = st.from_branch_id
             JOIN public.branches tb ON tb.id = st.to_branch_id
             WHERE st.tenant_id = $1 AND st.status IN ('dispatched','received','partial_received')
               AND (st.transfer_value >= 50000 OR fb.state_code <> tb.state_code)
               AND (st.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
             ORDER BY st.created_at DESC`,
            [ctx.tenant!.id, from, to]
          ),
        ]);
        return [...invRes.rows, ...trRes.rows];
      }

      if (type === "irp_json") {
        const res = await client.query(
          `SELECT i.invoice_number, i.invoice_type,
                  (i.created_at AT TIME ZONE 'Asia/Kolkata')::date AS invoice_date,
                  b.gstin AS seller_gstin, b.name AS seller_name, b.state_code AS seller_state,
                  i.customer_snapshot->>'name' AS buyer_name,
                  i.customer_snapshot->>'gstin' AS buyer_gstin,
                  i.customer_snapshot->>'state_code' AS buyer_state,
                  i.supply_type, i.taxable_amount, i.cgst_amount, i.sgst_amount, i.igst_amount, i.grand_total,
                  i.irn, i.ack_no,
                  COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                      'SlNo', row_number_idx,
                      'PrdDesc', ii.product_name,
                      'HsnCd', ii.hsn_code,
                      'Qty', ii.qty,
                      'UnitPrice', ii.unit_price,
                      'AssAmt', ii.taxable_value,
                      'GstRt', ii.gst_rate,
                      'CgstAmt', ii.cgst,
                      'SgstAmt', ii.sgst,
                      'IgstAmt', ii.igst,
                      'TotItemVal', ii.line_total
                    ))
                    FROM (SELECT *, ROW_NUMBER() OVER () AS row_number_idx FROM public.invoice_items WHERE invoice_id = i.id AND tenant_id = $1) ii
                  ), '[]'::jsonb) AS item_list
           FROM public.invoices i
           JOIN public.branches b ON b.id = i.branch_id
           WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','cancelled')
             AND COALESCE(i.customer_snapshot->>'gstin', '') <> ''
             AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
           ORDER BY i.created_at DESC`,
          [ctx.tenant!.id, from, to]
        );
        return res.rows;
      }

      return [];
    }
  );

  if (type === "eway_json" || type === "irp_json") {
    return new NextResponse(JSON.stringify({ generated_at: new Date().toISOString(), type, count: rows.length, records: rows }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${type}-${from}-to-${to}.json"`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type.slice(0, 30));

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-${from}-to-${to}.csv"`,
      },
    });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${type}-${from}-to-${to}.xlsx"`,
    },
  });
}
