import type { PoolClient } from "pg";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";

const BILL_IMG_RE = /\[bill_img:([^\]]+)\]/i;

export function splitBillImageNote(raw: string | null | undefined): { cleanNote: string | null; billImageUrl: string | null } {
  if (!raw) return { cleanNote: null, billImageUrl: null };
  const match = raw.match(BILL_IMG_RE);
  if (!match) return { cleanNote: raw.trim() || null, billImageUrl: null };
  const key = match[1].trim();
  const cleanNote = raw.replace(BILL_IMG_RE, "").trim() || null;
  return { cleanNote, billImageUrl: getPublicAssetUrl(key) };
}

export type PartyType = "customer" | "supplier";

export interface LedgerItemLine {
  item: string;
  colour?: string;
  size?: string;
  ctn?: string;
  pack?: string;
  pair?: string;
  rate?: string;
  disc_pct?: string;
  amount: number;
  [key: string]: string | number | undefined;
}

export interface PartyLedgerRow {
  key: string;
  entryId: string | null; // party_ledger_entries.id if saved/manual
  sourceType: "invoice" | "purchase" | "payment" | "manual";
  sourceId: string | null;
  entryDate: string;
  voucherNo: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  extraFields: Record<string, string>;
  items: LedgerItemLine[];
  actorName: string | null;
  actorLogin: string | null;
  billImageUrl?: string | null;
}

export interface PartySummary {
  id: string;
  type: PartyType;
  name: string;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  currentDue: number;
}

export interface PartyLedgerStatement {
  party: PartySummary;
  rows: PartyLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

function extractAttr(attrs: Record<string, string> | null | undefined, keys: string[]): string {
  if (!attrs) return "";
  for (const [k, v] of Object.entries(attrs)) {
    const low = k.toLowerCase();
    if (keys.some((t) => low.includes(t))) return String(v ?? "");
  }
  return "";
}

export async function loadPartyLedger(
  client: PoolClient,
  tenantId: string,
  partyType: PartyType,
  partyId: string
): Promise<PartyLedgerStatement | null> {
  // 1. Load party info
  let party: PartySummary | null = null;
  if (partyType === "customer") {
    const res = await client.query<{
      id: string;
      name: string;
      phone: string | null;
      gstin: string | null;
      address: string | null;
      current_due: string;
    }>(
      "SELECT id, name, phone, gstin, address, current_due::text FROM public.customers WHERE id = $1 AND tenant_id = $2",
      [partyId, tenantId]
    );
    const c = res.rows[0];
    if (!c) return null;
    party = {
      id: c.id,
      type: "customer",
      name: c.name,
      phone: c.phone,
      gstin: c.gstin,
      address: c.address,
      currentDue: Number(c.current_due || 0),
    };
  } else {
    const res = await client.query<{
      id: string;
      name: string;
      phone: string | null;
      gstin: string | null;
      address: string | null;
      current_due: string;
    }>(
      "SELECT id, name, phone, gstin, address, current_due::text FROM public.suppliers WHERE id = $1 AND tenant_id = $2",
      [partyId, tenantId]
    );
    const s = res.rows[0];
    if (!s) return null;
    party = {
      id: s.id,
      type: "supplier",
      name: s.name,
      phone: s.phone,
      gstin: s.gstin,
      address: s.address,
      currentDue: Number(s.current_due || 0),
    };
  }

  // 2. Load saved edits/annotations & manual entries
  const savedRes = await client.query<{
    id: string;
    source_type: "invoice" | "purchase" | "payment" | "manual";
    source_id: string | null;
    entry_date: string;
    voucher_no: string | null;
    particulars: string | null;
    debit: string;
    credit: string;
    extra_fields: Record<string, string> | null;
    items_json: LedgerItemLine[] | null;
    actor_name: string | null;
    actor_login: string | null;
  }>(
    `SELECT e.id, e.source_type, e.source_id, e.entry_date, e.voucher_no, e.particulars,
            e.debit::text, e.credit::text, e.extra_fields, e.items_json,
            COALESCE(pu.full_name, pc.full_name) AS actor_name,
            COALESCE(pu.username, pu.email, pc.username, pc.email) AS actor_login
     FROM public.party_ledger_entries e
     LEFT JOIN public.profiles pc ON pc.id = e.created_by
     LEFT JOIN public.profiles pu ON pu.id = e.updated_by
     WHERE e.tenant_id = $1 AND e.party_type = $2 AND e.party_id = $3
     ORDER BY e.entry_date ASC`,
    [tenantId, partyType, partyId]
  );

  const overrideMap = new Map<string, (typeof savedRes.rows)[number]>();
  const manualRows: PartyLedgerRow[] = [];

  for (const row of savedRes.rows) {
    if (row.source_type === "manual" || !row.source_id) {
      manualRows.push({
        key: `manual:${row.id}`,
        entryId: row.id,
        sourceType: "manual",
        sourceId: null,
        entryDate: row.entry_date,
        voucherNo: row.voucher_no || "ADJ",
        particulars: row.particulars || "Manual Entry",
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        balance: 0,
        extraFields: row.extra_fields ?? {},
        items: Array.isArray(row.items_json) ? row.items_json : [],
        actorName: row.actor_name,
        actorLogin: row.actor_login,
      });
    } else {
      overrideMap.set(`${row.source_type}:${row.source_id}`, row);
    }
  }

  const rawRows: PartyLedgerRow[] = [...manualRows];

  // 3. Load domain transactions
  if (partyType === "customer") {
    const [invRes, itemRes, payRes] = await Promise.all([
      client.query<{
        id: string;
        invoice_number: string | null;
        invoice_type: string;
        grand_total: string;
        notes: string | null;
        created_at: string;
        actor_name: string | null;
        actor_login: string | null;
      }>(
        `SELECT i.id, i.invoice_number, i.invoice_type, i.grand_total::text, i.notes, i.created_at,
                p.full_name AS actor_name, COALESCE(p.username, p.email) AS actor_login
         FROM public.invoices i
         LEFT JOIN public.profiles p ON p.id = i.created_by
         WHERE i.tenant_id = $1 AND i.customer_id = $2 AND i.status NOT IN ('draft', 'cancelled')
         ORDER BY i.created_at ASC`,
        [tenantId, partyId]
      ),
      client.query<{
        invoice_id: string;
        product_name: string;
        sku: string | null;
        qty: string;
        unit_price: string;
        discount_amount: string;
        line_total: string;
        attributes: Record<string, string> | null;
      }>(
        `SELECT ii.invoice_id, ii.product_name, ii.sku, ii.qty::text, ii.unit_price::text,
                ii.discount_amount::text, ii.line_total::text, pv.attributes
         FROM public.invoice_items ii
         JOIN public.invoices i ON i.id = ii.invoice_id
         LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
         WHERE ii.tenant_id = $1 AND i.customer_id = $2 AND i.status NOT IN ('draft', 'cancelled')`,
        [tenantId, partyId]
      ),
      client.query<{
        id: string;
        invoice_number: string | null;
        mode: string;
        amount: string;
        reference_no: string | null;
        paid_at: string;
        actor_name: string | null;
        actor_login: string | null;
      }>(
        `SELECT ip.id, i.invoice_number, ip.mode, ip.amount::text, ip.reference_no, ip.paid_at,
                p.full_name AS actor_name, COALESCE(p.username, p.email) AS actor_login
         FROM public.invoice_payments ip
         JOIN public.invoices i ON i.id = ip.invoice_id
         LEFT JOIN public.profiles p ON p.id = ip.recorded_by
         WHERE ip.tenant_id = $1 AND i.customer_id = $2 AND ip.amount > 0
         ORDER BY ip.paid_at ASC`,
        [tenantId, partyId]
      ),
    ]);

    const itemsByInv = new Map<string, LedgerItemLine[]>();
    for (const it of itemRes.rows) {
      const list = itemsByInv.get(it.invoice_id) ?? [];
      const qtyNum = Number(it.qty || 0);
      const rateNum = Number(it.unit_price || 0);
      const discAmt = Number(it.discount_amount || 0);
      const gross = qtyNum * rateNum;
      const discPct = gross > 0 && discAmt > 0 ? ((discAmt / gross) * 100).toFixed(1) : "";
      list.push({
        item: it.product_name,
        colour: extractAttr(it.attributes, ["color", "colour"]),
        size: extractAttr(it.attributes, ["size"]),
        ctn: "",
        pack: "",
        pair: String(qtyNum),
        rate: rateNum.toFixed(2),
        disc_pct: discPct,
        amount: Number(it.line_total),
      });
      itemsByInv.set(it.invoice_id, list);
    }

    for (const inv of invRes.rows) {
      const ov = overrideMap.get(`invoice:${inv.id}`);
      const isReturn = inv.invoice_type === "return_credit_note";
      const total = Number(inv.grand_total || 0);
      rawRows.push({
        key: `invoice:${inv.id}`,
        entryId: ov?.id ?? null,
        sourceType: "invoice",
        sourceId: inv.id,
        entryDate: ov?.entry_date ?? inv.created_at,
        voucherNo: ov?.voucher_no || inv.invoice_number || "INV",
        particulars:
          ov?.particulars ||
          inv.notes ||
          (isReturn ? "Sales Return / Credit Note" : `Sales Bill — ${inv.invoice_number || ""}`).trim(),
        debit: isReturn ? 0 : total,
        credit: isReturn ? total : 0,
        balance: 0,
        extraFields: ov?.extra_fields ?? {},
        items:
          ov && Array.isArray(ov.items_json) && ov.items_json.length > 0
            ? ov.items_json
            : itemsByInv.get(inv.id) ?? [],
        actorName: inv.actor_name ?? ov?.actor_name ?? null,
        actorLogin: inv.actor_login ?? ov?.actor_login ?? null,
      });
    }

    for (const pay of payRes.rows) {
      const ov = overrideMap.get(`payment:${pay.id}`);
      rawRows.push({
        key: `payment:${pay.id}`,
        entryId: ov?.id ?? null,
        sourceType: "payment",
        sourceId: pay.id,
        entryDate: ov?.entry_date ?? pay.paid_at,
        voucherNo: ov?.voucher_no || "R1",
        particulars:
          ov?.particulars ||
          `By ${pay.mode.replace("_", " ").toUpperCase()}${pay.reference_no ? ` — ${pay.reference_no}` : ""}${
            pay.invoice_number ? ` (Ref: ${pay.invoice_number})` : ""
          }`,
        debit: 0,
        credit: Number(pay.amount || 0),
        balance: 0,
        extraFields: ov?.extra_fields ?? {},
        items: ov && Array.isArray(ov.items_json) ? ov.items_json : [],
        actorName: pay.actor_name ?? ov?.actor_name ?? null,
        actorLogin: pay.actor_login ?? ov?.actor_login ?? null,
      });
    }
  } else {
    // Supplier ledger: Purchase Orders (Debit = goods bought / payable added) & Supplier Payments (Credit = money paid)
    const [poRes, itemRes, payRes] = await Promise.all([
      client.query<{
        id: string;
        bill_number: string | null;
        purchase_type: string;
        total_amount: string;
        paid_amount: string;
        notes: string | null;
        created_at: string;
        actor_name: string | null;
        actor_login: string | null;
      }>(
        `SELECT po.id, po.bill_number, po.purchase_type, po.total_amount::text, po.paid_amount::text,
                po.notes, po.created_at,
                p.full_name AS actor_name, COALESCE(p.username, p.email) AS actor_login
         FROM public.purchase_orders po
         LEFT JOIN public.profiles p ON p.id = po.created_by
         WHERE po.tenant_id = $1 AND po.supplier_id = $2
         ORDER BY po.created_at ASC`,
        [tenantId, partyId]
      ),
      client.query<{
        purchase_order_id: string;
        item_description: string;
        qty: string;
        unit_cost: string;
        line_total: string;
        attributes: Record<string, string> | null;
      }>(
        `SELECT pi.purchase_order_id, pi.item_description, pi.qty::text, pi.unit_cost::text,
                pi.line_total::text, pv.attributes
         FROM public.purchase_items pi
         JOIN public.purchase_orders po ON po.id = pi.purchase_order_id
         LEFT JOIN public.product_variants pv ON pv.id = pi.variant_id
         WHERE pi.tenant_id = $1 AND po.supplier_id = $2`,
        [tenantId, partyId]
      ),
      client.query<{
        id: string;
        mode: string;
        amount: string;
        reference_no: string | null;
        notes: string | null;
        paid_at: string;
        actor_name: string | null;
        actor_login: string | null;
      }>(
        `SELECT sp.id, sp.mode, sp.amount::text, sp.reference_no, sp.notes, sp.paid_at,
                p.full_name AS actor_name, COALESCE(p.username, p.email) AS actor_login
         FROM public.supplier_payments sp
         LEFT JOIN public.profiles p ON p.id = sp.recorded_by
         WHERE sp.tenant_id = $1 AND sp.supplier_id = $2
         ORDER BY sp.paid_at ASC`,
        [tenantId, partyId]
      ),
    ]);

    const itemsByPo = new Map<string, LedgerItemLine[]>();
    for (const it of itemRes.rows) {
      const list = itemsByPo.get(it.purchase_order_id) ?? [];
      list.push({
        item: it.item_description,
        colour: extractAttr(it.attributes, ["color", "colour"]),
        size: extractAttr(it.attributes, ["size"]),
        ctn: "",
        pack: "",
        pair: String(Number(it.qty)),
        rate: Number(it.unit_cost).toFixed(2),
        disc_pct: "",
        amount: Number(it.line_total),
      });
      itemsByPo.set(it.purchase_order_id, list);
    }

    for (const po of poRes.rows) {
      const ov = overrideMap.get(`purchase:${po.id}`);
      const { cleanNote, billImageUrl } = splitBillImageNote(po.notes);
      rawRows.push({
        key: `purchase:${po.id}`,
        entryId: ov?.id ?? null,
        sourceType: "purchase",
        sourceId: po.id,
        entryDate: ov?.entry_date ?? po.created_at,
        voucherNo: ov?.voucher_no || po.bill_number || "PO",
        particulars:
          ov?.particulars ||
          cleanNote ||
          `Purchase (${po.purchase_type.replace("_", " ")})${po.bill_number ? ` — B.No.: ${po.bill_number}` : ""}`,
        debit: Number(po.total_amount || 0),
        credit: 0,
        balance: 0,
        extraFields: ov?.extra_fields ?? (po.bill_number ? { lr_no: po.bill_number } : {}),
        items:
          ov && Array.isArray(ov.items_json) && ov.items_json.length > 0
            ? ov.items_json
            : itemsByPo.get(po.id) ?? [],
        actorName: po.actor_name ?? ov?.actor_name ?? null,
        actorLogin: po.actor_login ?? ov?.actor_login ?? null,
        billImageUrl,
      });
    }

    for (const pay of payRes.rows) {
      const ov = overrideMap.get(`payment:${pay.id}`);
      rawRows.push({
        key: `payment:${pay.id}`,
        entryId: ov?.id ?? null,
        sourceType: "payment",
        sourceId: pay.id,
        entryDate: ov?.entry_date ?? pay.paid_at,
        voucherNo: ov?.voucher_no || "R1",
        particulars:
          ov?.particulars ||
          `By ${pay.mode.replace("_", " ").toUpperCase()}${pay.reference_no ? ` — ${pay.reference_no}` : ""}${
            pay.notes ? ` (${pay.notes})` : ""
          }`,
        debit: 0,
        credit: Number(pay.amount || 0),
        balance: 0,
        extraFields: ov?.extra_fields ?? {},
        items: ov && Array.isArray(ov.items_json) ? ov.items_json : [],
        actorName: pay.actor_name ?? ov?.actor_name ?? null,
        actorLogin: pay.actor_login ?? ov?.actor_login ?? null,
      });
    }
  }

  // 4. Sort chronologically and compute running balance
  rawRows.sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = rawRows.map((r) => {
    totalDebit += r.debit;
    totalCredit += r.credit;
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  return {
    party,
    rows,
    totalDebit,
    totalCredit,
    closingBalance: running,
  };
}
