import { NextResponse, type NextRequest } from "next/server";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { loadPartyLedger, type PartyType } from "@/lib/ledger/party-ledger";
import { fetchImageForPdf } from "@/lib/pdf/image-helper";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";

export const runtime = "nodejs";

function rowsToCsv(rows: Array<Record<string, string | number>>, fallbackHeaders: string[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : fallbackHeaders;
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return lines.join("\r\n");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await context.params;
  if (type !== "customer" && type !== "supplier") {
    return NextResponse.json({ error: "Invalid party type." }, { status: 400 });
  }
  const partyType: PartyType = type;

  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (partyType === "customer" && !canAccess(ctx, "customers.view").allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (partyType === "supplier" && !canAccess(ctx, "suppliers.manage").allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = (request.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (!["pdf", "xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Unsupported format. Use pdf, xlsx, or csv." }, { status: 400 });
  }

  const statement = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadPartyLedger(client, ctx.tenant!.id, partyType, id)
  );

  if (!statement) {
    return NextResponse.json({ error: "Party not found." }, { status: 404 });
  }

  const ledgerConfig = resolveLedgerConfig(ctx.tenant.brand_config);
  const activeItemCols = ledgerConfig.item_columns.filter((c) => c.enabled);
  const activeHeaderFields = ledgerConfig.header_fields.filter((f) => f.enabled);
  const safeSlug = statement.party.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ledger";
  const fileBase = `${safeSlug}-${partyType}-ledger`;

  if (format === "pdf") {
    const rawLogoKey = ctx.tenant.brand_config?.logo_key ?? null;
    const logoSource =
      ctx.tenant.brand_config?.logo_pdf_data_url ||
      (rawLogoKey ? getPublicAssetUrl(rawLogoKey) : null);
    const pdfSafeLogo = await fetchImageForPdf(logoSource, { format: "png", maxDim: 160 });

    const { renderPartyLedgerPdfBuffer } = await import("@/lib/pdf/documents");
    const pdf = await renderPartyLedgerPdfBuffer({
      tenantName: ctx.tenant.name,
      logoUrl: pdfSafeLogo,
      partyName: statement.party.name,
      partyType,
      partyPhone: statement.party.phone,
      partyGstin: statement.party.gstin,
      partyAddress: statement.party.address,
      itemColumns: activeItemCols.map((c) => ({ key: c.key, label: c.label })),
      headerFields: activeHeaderFields.map((f) => ({ key: f.key, label: f.label })),
      rows: statement.rows.map((r) => ({
        entryDate: r.entryDate,
        voucherNo: r.voucherNo,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
        balance: r.balance,
        extraFields: r.extraFields,
        items: r.items,
        builtBy: r.actorName
          ? `${r.actorName}${r.actorLogin ? ` (@${r.actorLogin})` : ""}`
          : null,
      })),
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      closingBalance: statement.closingBalance,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
      },
    });
  }

  // Build tabular rows for Excel and CSV
  const statementRows = statement.rows.map((r) => {
    const base: Record<string, string | number> = {
      "Date & Time": new Date(r.entryDate).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }),
      "Ch./Voc": r.voucherNo,
      Particulars: r.particulars,
    };
    for (const f of activeHeaderFields) {
      base[f.label] = r.extraFields[f.key] ?? "";
    }
    base["Debit (INR)"] = r.debit;
    base["Credit (INR)"] = r.credit;
    base["Balance (INR)"] = `${Math.abs(r.balance).toFixed(2)} ${r.balance >= 0 ? "Dr" : "Cr"}`;
    base["Built By"] = r.actorName
      ? `${r.actorName}${r.actorLogin ? ` (@${r.actorLogin})` : ""}`
      : "";
    return base;
  });

  const itemRows: Array<Record<string, string | number>> = [];
  for (const r of statement.rows) {
    for (const it of r.items) {
      const row: Record<string, string | number> = {
        "Date & Time": new Date(r.entryDate).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "short",
        }),
        "Ch./Voc": r.voucherNo,
        Item: it.item,
      };
      for (const c of activeItemCols) {
        row[c.label] = it[c.key] ?? "";
      }
      row["Amount (INR)"] = Number(it.amount || 0);
      row["Built By"] = r.actorName
        ? `${r.actorName}${r.actorLogin ? ` (@${r.actorLogin})` : ""}`
        : "";
      itemRows.push(row);
    }
  }

  if (format === "csv") {
    const csvHeaders = [
      "Date & Time",
      "Ch./Voc",
      "Particulars",
      ...activeHeaderFields.map((f) => f.label),
      "Debit (INR)",
      "Credit (INR)",
      "Balance (INR)",
      "Built By",
    ];
    const csv = rowsToCsv(statementRows, csvHeaders);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const wsStatement = XLSX.utils.json_to_sheet(statementRows);
  XLSX.utils.book_append_sheet(wb, wsStatement, "Ledger Statement");
  if (itemRows.length > 0) {
    const wsItems = XLSX.utils.json_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(wb, wsItems, "Item Breakdown");
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
}
