import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { amountInWordsIndian } from "@/lib/gst/calculator";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 10, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "bold" },
  subtitle: { fontSize: 9, color: "#475569", marginTop: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 5 },
  th: { fontWeight: "bold", backgroundColor: "#f1f5f9", paddingVertical: 6 },
  colName: { flex: 3, paddingRight: 6 },
  colSmall: { flex: 1, textAlign: "right" },
  totalsBox: { marginTop: 12, alignSelf: "flex-end", width: 210, borderTopWidth: 1, borderTopColor: "#cbd5e1", paddingTop: 6 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  grandTotal: { fontSize: 11, fontWeight: "bold", borderTopWidth: 1, borderTopColor: "#0f172a", paddingTop: 4, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48%", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 8, marginBottom: 8 },
  thumb: { width: "100%", height: 110, objectFit: "cover", borderRadius: 4, marginBottom: 6 },
});

export interface InvoicePdfData {
  tenantName: string;
  branchName: string;
  branchAddress?: string | null;
  branchGstin?: string | null;
  invoiceNumber: string;
  invoiceType: string;
  createdAt: string;
  customerName: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
  supplyType: string;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  items: Array<{
    product_name: string;
    sku?: string | null;
    hsn_code?: string | null;
    qty: number;
    unit_price: number;
    gst_rate: number;
    line_total: number;
  }>;
  terms?: string;
}

export async function renderInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  const docTitle =
    data.invoiceType === "return_credit_note"
      ? "CREDIT NOTE"
      : data.invoiceType === "estimate_bill_of_supply"
      ? "ESTIMATE / BILL OF SUPPLY"
      : "TAX INVOICE";

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{data.tenantName}</Text>
            <Text style={styles.subtitle}>{data.branchName}</Text>
            {data.branchAddress && <Text style={styles.subtitle}>{data.branchAddress}</Text>}
            {data.branchGstin && <Text style={styles.subtitle}>GSTIN: {data.branchGstin}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "bold" }}>{docTitle}</Text>
            <Text style={styles.subtitle}>No: {data.invoiceNumber}</Text>
            <Text style={styles.subtitle}>
              Date: {new Date(data.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: "bold" }}>Billed To: {data.customerName}</Text>
          {data.customerPhone && <Text style={styles.subtitle}>Phone: {data.customerPhone}</Text>}
          {data.customerGstin && <Text style={styles.subtitle}>Customer GSTIN: {data.customerGstin}</Text>}
        </View>

        <View style={[styles.row, styles.th]}>
          <Text style={styles.colName}>Item</Text>
          <Text style={styles.colSmall}>HSN</Text>
          <Text style={styles.colSmall}>Qty</Text>
          <Text style={styles.colSmall}>Rate</Text>
          <Text style={styles.colSmall}>GST%</Text>
          <Text style={styles.colSmall}>Total</Text>
        </View>

        {data.items.map((it, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colName}>
              {it.product_name} {it.sku ? `(${it.sku})` : ""}
            </Text>
            <Text style={styles.colSmall}>{it.hsn_code || "—"}</Text>
            <Text style={styles.colSmall}>{it.qty}</Text>
            <Text style={styles.colSmall}>Rs.{Number(it.unit_price).toFixed(2)}</Text>
            <Text style={styles.colSmall}>{it.gst_rate}%</Text>
            <Text style={styles.colSmall}>Rs.{Number(it.line_total).toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalLine}>
            <Text>Taxable Value</Text>
            <Text>Rs.{Number(data.taxableAmount).toFixed(2)}</Text>
          </View>
          {data.cgstAmount > 0 && (
            <View style={styles.totalLine}>
              <Text>CGST</Text>
              <Text>Rs.{Number(data.cgstAmount).toFixed(2)}</Text>
            </View>
          )}
          {data.sgstAmount > 0 && (
            <View style={styles.totalLine}>
              <Text>SGST</Text>
              <Text>Rs.{Number(data.sgstAmount).toFixed(2)}</Text>
            </View>
          )}
          {data.igstAmount > 0 && (
            <View style={styles.totalLine}>
              <Text>IGST</Text>
              <Text>Rs.{Number(data.igstAmount).toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.totalLine, styles.grandTotal]}>
            <Text>Grand Total</Text>
            <Text>Rs.{Number(data.grandTotal).toFixed(2)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>Paid / Due</Text>
            <Text>
              Rs.{Number(data.paidAmount).toFixed(2)} / Rs.{Number(data.dueAmount).toFixed(2)}
            </Text>
          </View>
        </View>

        <Text style={{ marginTop: 12, fontSize: 8, color: "#334155" }}>
          Amount in Words: {amountInWordsIndian(data.grandTotal)}
        </Text>
        {data.terms && (
          <Text style={{ marginTop: 10, fontSize: 8, color: "#64748b" }}>Terms: {data.terms}</Text>
        )}
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}

export interface CataloguePdfData {
  tenantName: string;
  title: string;
  whatsapp: string;
  priceLabel: "Retail" | "Wholesale" | "Hide";
  items: Array<{
    name: string;
    modelCode: string;
    category?: string | null;
    imageUrl?: string | null;
    price?: number | null;
    sizes?: string;
  }>;
}

export async function renderCataloguePdfBuffer(data: CataloguePdfData): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ backgroundColor: "#0f172a", padding: 16, borderRadius: 6, marginBottom: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#ffffff" }}>{data.tenantName}</Text>
          <Text style={{ fontSize: 11, color: "#38bdf8", marginTop: 4 }}>{data.title}</Text>
          {data.whatsapp && (
            <Text style={{ fontSize: 9, color: "#cbd5e1", marginTop: 4 }}>
              Order / Enquiry on WhatsApp: +{data.whatsapp}
            </Text>
          )}
        </View>

        <View style={styles.grid}>
          {data.items.slice(0, 150).map((it, idx) => (
            <View key={idx} style={styles.card} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              {it.imageUrl && <Image src={it.imageUrl} style={styles.thumb} />}
              <Text style={{ fontWeight: "bold", fontSize: 10 }}>{it.name}</Text>
              <Text style={styles.subtitle}>
                Code: {it.modelCode} {it.category ? `• ${it.category}` : ""}
              </Text>
              {it.sizes && <Text style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>{it.sizes}</Text>}
              {data.priceLabel !== "Hide" && it.price != null && (
                <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0284c7", marginTop: 4 }}>
                  Rs.{Number(it.price).toLocaleString("en-IN")}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}

export interface ChallanPdfData {
  tenantName: string;
  docNumber: string;
  docType: string;
  status: string;
  createdAt: string;
  fromName: string;
  fromAddress?: string | null;
  fromGstin?: string | null;
  toName: string;
  toAddress?: string | null;
  toGstin?: string | null;
  transportName?: string | null;
  lrNumber?: string | null;
  vehicleNo?: string | null;
  ewayBillNo?: string | null;
  transferValue: number;
  igstAmount: number;
  items: Array<{
    product_name: string;
    sku: string;
    qty_sent: number;
    qty_received: number;
    transfer_price: number;
  }>;
}

export async function renderChallanPdfBuffer(data: ChallanPdfData): Promise<Buffer> {
  const isTaxInvoice = data.docType === "branch_transfer_invoice";
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{data.tenantName}</Text>
            <Text style={styles.subtitle}>
              {isTaxInvoice ? "BRANCH TRANSFER TAX INVOICE (IGST)" : "STOCK TRANSFER DELIVERY CHALLAN"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "bold" }}>{data.docNumber}</Text>
            <Text style={styles.subtitle}>Status: {data.status.toUpperCase()}</Text>
            <Text style={styles.subtitle}>
              Date: {new Date(data.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 8, borderRadius: 4 }}>
            <Text style={{ fontWeight: "bold", fontSize: 8, color: "#475569" }}>FROM (DISPATCH)</Text>
            <Text style={{ fontWeight: "bold", marginTop: 2 }}>{data.fromName}</Text>
            {data.fromAddress && <Text style={styles.subtitle}>{data.fromAddress}</Text>}
            {data.fromGstin && <Text style={styles.subtitle}>GSTIN: {data.fromGstin}</Text>}
          </View>
          <View style={{ flex: 1, backgroundColor: "#f8fafc", padding: 8, borderRadius: 4 }}>
            <Text style={{ fontWeight: "bold", fontSize: 8, color: "#475569" }}>TO (DESTINATION)</Text>
            <Text style={{ fontWeight: "bold", marginTop: 2 }}>{data.toName}</Text>
            {data.toAddress && <Text style={styles.subtitle}>{data.toAddress}</Text>}
            {data.toGstin && <Text style={styles.subtitle}>GSTIN: {data.toGstin}</Text>}
          </View>
        </View>

        {(data.transportName || data.lrNumber || data.vehicleNo || data.ewayBillNo) && (
          <View style={{ marginBottom: 10, fontSize: 8, color: "#334155" }}>
            <Text>
              {[
                data.transportName && `Transport: ${data.transportName}`,
                data.lrNumber && `LR No: ${data.lrNumber}`,
                data.vehicleNo && `Vehicle: ${data.vehicleNo}`,
                data.ewayBillNo && `E-Way Bill: ${data.ewayBillNo}`,
              ]
                .filter(Boolean)
                .join("  |  ")}
            </Text>
          </View>
        )}

        <View style={[styles.row, styles.th]}>
          <Text style={styles.colName}>Item / SKU</Text>
          <Text style={styles.colSmall}>Sent</Text>
          <Text style={styles.colSmall}>Recd</Text>
          <Text style={styles.colSmall}>Rate</Text>
          <Text style={styles.colSmall}>Value</Text>
        </View>

        {data.items.map((it, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colName}>
              {it.product_name} ({it.sku})
            </Text>
            <Text style={styles.colSmall}>{it.qty_sent}</Text>
            <Text style={styles.colSmall}>{it.qty_received}</Text>
            <Text style={styles.colSmall}>Rs.{Number(it.transfer_price).toFixed(2)}</Text>
            <Text style={styles.colSmall}>Rs.{(Number(it.qty_sent) * Number(it.transfer_price)).toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalLine}>
            <Text>Transfer Value</Text>
            <Text>Rs.{Number(data.transferValue).toFixed(2)}</Text>
          </View>
          {isTaxInvoice && (
            <View style={styles.totalLine}>
              <Text>IGST</Text>
              <Text>Rs.{Number(data.igstAmount).toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.totalLine, styles.grandTotal]}>
            <Text>Total Document Value</Text>
            <Text>Rs.{(Number(data.transferValue) + (isTaxInvoice ? Number(data.igstAmount) : 0)).toFixed(2)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
