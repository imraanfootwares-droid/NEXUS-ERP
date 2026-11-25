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
  logoUrl?: string | null;
  accentColor?: string | null;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  branchEmail?: string | null;
  branchGstin?: string | null;
  signatoryName?: string | null;
  bankDetails?: {
    account_holder?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    branch_name?: string;
    upi_id?: string;
  } | null;
  invoiceNumber: string;
  invoiceType: string;
  createdAt: string;
  builtBy?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  shipToName?: string | null;
  shipToAddress?: string | null;
  placeOfSupply?: string | null;
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
  footerNote?: string;
  showHsn?: boolean;
  showGst?: boolean;
}

export async function renderInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  const allowGst = data.showGst ?? true;
  const allowHsn = data.showHsn ?? true;
  const hasGst =
    data.cgstAmount > 0 ||
    data.sgstAmount > 0 ||
    data.igstAmount > 0 ||
    data.items.some((it) => Number(it.gst_rate || 0) > 0);
  const showGstDetails = allowGst && hasGst;

  const docTitle =
    data.invoiceType === "return_credit_note"
      ? "CREDIT NOTE"
      : data.invoiceType === "estimate_bill_of_supply"
      ? "ESTIMATE / BILL OF SUPPLY"
      : showGstDetails
      ? "TAX INVOICE"
      : "INVOICE";

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: "65%" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {data.logoUrl ? (
              <Image
                src={data.logoUrl}
                style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 4 }}
              />
            ) : null}
            <View>
              <Text style={[styles.title, data.accentColor ? { color: data.accentColor } : {}]}>
                {data.tenantName}
              </Text>
              {data.branchAddress && <Text style={styles.subtitle}>{data.branchAddress}</Text>}
              {data.branchPhone && <Text style={styles.subtitle}>Phone: {data.branchPhone}</Text>}
              {data.branchEmail && <Text style={styles.subtitle}>Email: {data.branchEmail}</Text>}
              {allowGst && data.branchGstin && <Text style={styles.subtitle}>GSTIN: {data.branchGstin}</Text>}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "bold", color: data.accentColor || "#0f172a" }}>
              {docTitle}
            </Text>
            <Text style={styles.subtitle}>No: {data.invoiceNumber}</Text>
            <Text style={styles.subtitle}>
              Date:{" "}
              {new Date(data.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </Text>
            {data.builtBy && <Text style={styles.subtitle}>Built By: {data.builtBy}</Text>}
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "bold" }}>BUYER (BILL TO): {data.customerName}</Text>
            {data.customerAddress && <Text style={styles.subtitle}>{data.customerAddress}</Text>}
            {data.customerPhone && <Text style={styles.subtitle}>Phone: {data.customerPhone}</Text>}
            {allowGst && data.customerGstin && <Text style={styles.subtitle}>GSTIN: {data.customerGstin}</Text>}
            {allowGst && data.placeOfSupply && <Text style={styles.subtitle}>Place of Supply: {data.placeOfSupply}</Text>}
          </View>
          {allowGst && (
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "bold" }}>CONSIGNEE (SHIP TO): {data.shipToName || data.customerName}</Text>
              <Text style={styles.subtitle}>{data.shipToAddress || data.customerAddress || "Same as Buyer Address"}</Text>
            </View>
          )}
        </View>

        <View style={[styles.row, styles.th]}>
          <Text style={styles.colName}>Item</Text>
          {allowHsn && <Text style={styles.colSmall}>HSN</Text>}
          <Text style={styles.colSmall}>Qty</Text>
          <Text style={styles.colSmall}>Rate</Text>
          {showGstDetails && <Text style={styles.colSmall}>GST%</Text>}
          <Text style={styles.colSmall}>Total</Text>
        </View>

        {data.items.map((it, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colName}>
              {it.product_name} {it.sku ? `(${it.sku})` : ""}
            </Text>
            {allowHsn && <Text style={styles.colSmall}>{it.hsn_code || "-"}</Text>}
            <Text style={styles.colSmall}>{it.qty}</Text>
            <Text style={styles.colSmall}>Rs.{Number(it.unit_price).toFixed(2)}</Text>
            {showGstDetails && (
              <Text style={styles.colSmall}>
                {Number(it.gst_rate || 0) > 0 ? `${it.gst_rate}%` : "-"}
              </Text>
            )}
            <Text style={styles.colSmall}>Rs.{Number(it.line_total).toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          {showGstDetails && (
            <View style={styles.totalLine}>
              <Text>Taxable Value</Text>
              <Text>Rs.{Number(data.taxableAmount).toFixed(2)}</Text>
            </View>
          )}
          {showGstDetails && data.cgstAmount > 0 && (
            <View style={styles.totalLine}>
              <Text>CGST</Text>
              <Text>Rs.{Number(data.cgstAmount).toFixed(2)}</Text>
            </View>
          )}
          {showGstDetails && data.sgstAmount > 0 && (
            <View style={styles.totalLine}>
              <Text>SGST</Text>
              <Text>Rs.{Number(data.sgstAmount).toFixed(2)}</Text>
            </View>
          )}
          {showGstDetails && data.igstAmount > 0 && (
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

        <Text style={{ marginTop: 12, fontSize: 8.5, fontWeight: "bold", color: "#0f172a" }}>
          Amount in Words: {amountInWordsIndian(data.grandTotal)}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, borderTopWidth: 0.75, borderTopColor: "#cbd5e1", paddingTop: 8 }}>
          <View style={{ maxWidth: "55%" }}>
            {data.bankDetails && (data.bankDetails.bank_name || data.bankDetails.account_number) && (
              <View style={{ borderWidth: 0.75, borderColor: "#0f172a", padding: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: "bold", marginBottom: 2 }}>BANK DETAILS</Text>
                {data.bankDetails.account_holder && <Text style={{ fontSize: 8, fontWeight: "bold" }}>{data.bankDetails.account_holder}</Text>}
                {data.bankDetails.bank_name && <Text style={{ fontSize: 8 }}>{data.bankDetails.bank_name}{data.bankDetails.branch_name ? ` - ${data.bankDetails.branch_name}` : ""}</Text>}
                {data.bankDetails.account_number && <Text style={{ fontSize: 8 }}>ACC NO: {data.bankDetails.account_number}</Text>}
                {data.bankDetails.ifsc_code && <Text style={{ fontSize: 8 }}>IFSC CODE: {data.bankDetails.ifsc_code}</Text>}
              </View>
            )}
            {data.terms && <Text style={{ fontSize: 7.5, color: "#64748b" }}>Terms: {data.terms}</Text>}
            {data.footerNote && <Text style={{ fontSize: 8, fontWeight: "bold", color: "#334155", marginTop: 3 }}>{data.footerNote}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8.5, fontWeight: "bold" }}>For {data.signatoryName || data.tenantName}</Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 26, borderTopWidth: 0.5, borderTopColor: "#64748b", paddingTop: 2 }}>
              Authorised Signature
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}

export interface CataloguePdfData {
  tenantName: string;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  whatsapp: string;
  catalogueUrl?: string;
  priceLabel: "Retail" | "Wholesale" | "Hide";
  items: Array<{
    name: string;
    modelCode: string;
    category?: string | null;
    brand?: string | null;
    description?: string | null;
    isNewArrival?: boolean;
    pcsPerCarton?: number | null;
    imageUrl?: string | null;
    price?: number | null;
    sizes?: string;
  }>;
}

export async function renderCataloguePdfBuffer(data: CataloguePdfData): Promise<Buffer> {
  const monogram =
    data.tenantName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "S";

  const cleanAscii = (v: string) =>
    v.replace(/[\u2013\u2014]/g, "-").replace(/\u2022/g, "|").replace(/\u20b9/g, "Rs.");

  const doc = (
    <Document>
      <Page
        size="A4"
        style={{
          paddingTop: 22,
          paddingBottom: 34,
          paddingHorizontal: 22,
          fontSize: 9,
          fontFamily: "Helvetica",
          color: "#171717",
          backgroundColor: "#f4f7fb",
        }}
      >
        {/* Frosted-Glass Inspired Storefront Header Card */}
        <View
          style={{
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#dbe4f0",
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 }}>
            {data.logoUrl ? (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  backgroundColor: "#ffffff",
                  padding: 3,
                  marginRight: 11,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={data.logoUrl} style={{ width: 36, height: 36, objectFit: "contain" }} />
              </View>
            ) : (
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  backgroundColor: "#171717",
                  marginRight: 11,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "bold", color: "#ffffff" }}>{monogram}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "bold", color: "#171717" }}>
                {cleanAscii(data.tenantName)}
              </Text>
              <Text style={{ fontSize: 9.5, fontWeight: "bold", color: "#334155", marginTop: 2 }}>
                {cleanAscii(data.title)}
              </Text>
              {data.subtitle ? (
                <Text style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>
                  {cleanAscii(data.subtitle)}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 9,
              paddingVertical: 7,
              paddingHorizontal: 10,
              alignItems: "flex-end",
            }}
          >
            <Text style={{ fontSize: 7.5, fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>
              {data.items.length} Products{data.priceLabel !== "Hide" ? ` | ${data.priceLabel} Prices` : ""}
            </Text>
            {data.whatsapp ? (
              <Text style={{ fontSize: 8.5, fontWeight: "bold", color: "#0f766e", marginTop: 3 }}>
                WhatsApp: +{data.whatsapp.replace(/\D/g, "")}
              </Text>
            ) : null}
            {data.catalogueUrl ? (
              <Text style={{ fontSize: 7.5, color: "#475569", marginTop: 2 }}>
                {data.catalogueUrl}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 2-Column Product Cards Grid matching Storefront Cards */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {data.items.slice(0, 150).map((it, idx) => {
            const metaParts = [it.modelCode, it.category || "", it.brand || ""].filter(Boolean);
            const shortDesc =
              it.description && it.description.trim().length > 0
                ? it.description.trim().slice(0, 88) + (it.description.trim().length > 88 ? "..." : "")
                : null;

            return (
              <View
                key={idx}
                wrap={false}
                style={{
                  width: "48.8%",
                  backgroundColor: "#ffffff",
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 11,
                }}
              >
                {/* Image Box */}
                <View
                  style={{
                    height: 128,
                    backgroundColor: "#f8fafc",
                    borderWidth: 1,
                    borderColor: "#eef2f6",
                    borderRadius: 9,
                    marginBottom: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    padding: 6,
                  }}
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image
                      src={it.imageUrl}
                      style={{
                        width: "100%",
                        height: 114,
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#94a3b8" }}>
                      {cleanAscii(it.modelCode || it.name.slice(0, 12))}
                    </Text>
                  )}

                  {it.isNewArrival && (
                    <View
                      style={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        backgroundColor: "#171717",
                        borderRadius: 99,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 6.5, fontWeight: "bold", color: "#ffffff" }}>NEW</Text>
                    </View>
                  )}
                </View>

                {/* Product Title & Code */}
                <Text style={{ fontSize: 10.5, fontWeight: "bold", color: "#171717" }}>
                  {cleanAscii(it.name)}
                </Text>
                <Text style={{ fontSize: 7.8, color: "#64748b", marginTop: 2 }}>
                  {cleanAscii(metaParts.join("  |  "))}
                </Text>

                {/* Sizes & Carton Info */}
                {(it.sizes || it.pcsPerCarton) && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {it.sizes && (
                      <View
                        style={{
                          backgroundColor: "#f1f5f9",
                          borderRadius: 5,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 7.2, color: "#334155" }}>
                          Sizes: {cleanAscii(it.sizes)}
                        </Text>
                      </View>
                    )}
                    {it.pcsPerCarton ? (
                      <View
                        style={{
                          backgroundColor: "#eff6ff",
                          borderRadius: 5,
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ fontSize: 7.2, color: "#1d4ed8", fontWeight: "bold" }}>
                          {it.pcsPerCarton} pcs / carton
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {shortDesc && (
                  <Text style={{ fontSize: 7.5, color: "#64748b", marginTop: 4, lineHeight: 1.3 }}>
                    {cleanAscii(shortDesc)}
                  </Text>
                )}

                {/* Price Footer */}
                {data.priceLabel !== "Hide" && it.price != null && (
                  <View
                    style={{
                      marginTop: 7,
                      paddingTop: 6,
                      borderTopWidth: 1,
                      borderTopColor: "#f1f5f9",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "bold", color: "#171717" }}>
                      Rs. {Number(it.price).toLocaleString("en-IN")}
                    </Text>
                    <View
                      style={{
                        backgroundColor: "#f1f5f9",
                        borderRadius: 99,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 7, fontWeight: "bold", color: "#475569" }}>
                        {data.priceLabel}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Fixed Page Footer */}
        <View
          fixed
          style={{
            position: "absolute",
            bottom: 12,
            left: 22,
            right: 22,
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: "#dbe4f0",
            paddingTop: 5,
          }}
        >
          <Text style={{ fontSize: 7.5, color: "#64748b" }}>
            {cleanAscii(data.tenantName)} | Official Product Catalogue
          </Text>
          <Text
            style={{ fontSize: 7.5, color: "#64748b" }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
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

export interface PartyLedgerPdfData {
  tenantName: string;
  logoUrl?: string | null;
  partyName: string;
  partyType: "customer" | "supplier";
  partyPhone?: string | null;
  partyGstin?: string | null;
  partyAddress?: string | null;
  itemColumns: Array<{ key: string; label: string }>;
  headerFields: Array<{ key: string; label: string }>;
  rows: Array<{
    entryDate: string;
    voucherNo: string;
    particulars: string;
    debit: number;
    credit: number;
    balance: number;
    extraFields: Record<string, string>;
    items: Array<Record<string, string | number | undefined>>;
    builtBy?: string | null;
  }>;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export async function renderPartyLedgerPdfBuffer(data: PartyLedgerPdfData): Promise<Buffer> {
  const fmtMoney = (n: number) =>
    Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const doc = (
    <Document>
      <Page size="A4" style={{ padding: 20, fontSize: 8, fontFamily: "Helvetica", color: "#171717", backgroundColor: "#ffffff" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: "#171717", paddingBottom: 8, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "60%" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {data.logoUrl ? (
              <Image src={data.logoUrl} style={{ width: 38, height: 38, objectFit: "contain" }} />
            ) : null}
            <View>
              <Text style={{ fontSize: 13.5, fontWeight: "bold", color: "#171717" }}>{data.partyName}</Text>
              <Text style={{ fontSize: 8, color: "#52525b", marginTop: 1.5 }}>
                {data.tenantName}
                {data.partyPhone ? `  |  ${data.partyPhone}` : ""}
                {data.partyGstin ? `  |  GSTIN: ${data.partyGstin}` : ""}
              </Text>
              {data.partyAddress ? <Text style={{ fontSize: 7.5, color: "#71717a", marginTop: 1 }}>{data.partyAddress}</Text> : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={{ backgroundColor: "#fef3c7", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2.5 }}>
              <Text style={{ fontSize: 7, fontWeight: "bold", color: "#92400e" }}>
                {data.partyType === "supplier" ? "Supplier Statement" : "Customer Statement"}
              </Text>
            </View>
            <Text style={{ fontSize: 7, color: "#71717a", marginTop: 3 }}>
              Generated {new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </View>
        </View>

        {/* 4 Summary KPI Cards matching Web UI */}
        <View style={{ flexDirection: "row", gap: 7, marginBottom: 10 }}>
          <View style={{ flex: 1, borderWidth: 0.75, borderColor: "#e4e4e7", borderRadius: 6, padding: 7, backgroundColor: "#fafafa" }}>
            <Text style={{ fontSize: 6.5, fontWeight: "bold", color: "#71717a" }}>ENTRIES</Text>
            <Text style={{ fontSize: 11, fontWeight: "bold", color: "#171717", marginTop: 2 }}>
              {data.rows.length} Records
            </Text>
          </View>
          <View style={{ flex: 1, borderWidth: 0.75, borderColor: "#e4e4e7", borderRadius: 6, padding: 7, backgroundColor: "#fafafa" }}>
            <Text style={{ fontSize: 6.5, fontWeight: "bold", color: "#71717a" }}>TOTAL DEBIT</Text>
            <Text style={{ fontSize: 10.5, fontWeight: "bold", color: "#171717", marginTop: 2 }}>
              Rs.{fmtMoney(data.totalDebit)} Dr
            </Text>
          </View>
          <View style={{ flex: 1, borderWidth: 0.75, borderColor: "#e4e4e7", borderRadius: 6, padding: 7, backgroundColor: "#fafafa" }}>
            <Text style={{ fontSize: 6.5, fontWeight: "bold", color: "#71717a" }}>TOTAL CREDIT</Text>
            <Text style={{ fontSize: 10.5, fontWeight: "bold", color: "#047857", marginTop: 2 }}>
              Rs.{fmtMoney(data.totalCredit)} Cr
            </Text>
          </View>
          <View style={{ flex: 1, borderWidth: 0.75, borderColor: "#d4d4d8", borderRadius: 6, padding: 7, backgroundColor: "#f4f4f5" }}>
            <Text style={{ fontSize: 6.5, fontWeight: "bold", color: "#52525b" }}>CLOSING BALANCE</Text>
            <Text style={{ fontSize: 10.5, fontWeight: "bold", color: "#171717", marginTop: 2 }}>
              Rs.{fmtMoney(Math.abs(data.closingBalance))} {data.closingBalance >= 0 ? "Dr" : "Cr"}
            </Text>
          </View>
        </View>

        {/* Main Ledger Table Container */}
        <View style={{ borderWidth: 0.75, borderColor: "#d4d4d8", borderRadius: 6, overflow: "hidden" }}>
          {/* Table Column Headers */}
          <View style={{ flexDirection: "row", backgroundColor: "#f4f4f5", borderBottomWidth: 0.75, borderBottomColor: "#d4d4d8", paddingVertical: 6, paddingHorizontal: 6, fontWeight: "bold", fontSize: 6.8, color: "#52525b" }}>
            <Text style={{ width: "16%" }}>DATE &amp; TIME</Text>
            <Text style={{ width: "10%" }}>CH./VOC</Text>
            <Text style={{ width: "28%" }}>PARTICULARS</Text>
            <Text style={{ width: "12%", textAlign: "right" }}>DEBIT (Rs.)</Text>
            <Text style={{ width: "11%", textAlign: "right" }}>CREDIT (Rs.)</Text>
            <Text style={{ width: "13%", textAlign: "right" }}>BALANCE (Rs.)</Text>
            <Text style={{ width: "10%", textAlign: "right" }}>BUILT BY</Text>
          </View>

          {data.rows.map((r, idx) => {
            const hasItems = r.items.length > 0;
            const isPayment = r.credit > 0 && r.debit === 0;
            const extras = data.headerFields
              .map((f) => (r.extraFields[f.key] ? `${f.label}: ${r.extraFields[f.key]}` : null))
              .filter(Boolean)
              .join("  |  ");

            return (
              <View
                key={idx}
                wrap={false}
                style={{
                  borderBottomWidth: 0.75,
                  borderBottomColor: "#e4e4e7",
                  borderLeftWidth: hasItems ? 3 : 0,
                  borderLeftColor: "#171717",
                  backgroundColor: hasItems ? "#fafafa" : "#ffffff",
                  paddingTop: 6,
                  paddingBottom: hasItems ? 8 : 6,
                }}
              >
                {/* Parent Ledger Entry Row */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 6 }}>
                  <Text style={{ width: "16%", fontSize: 7, color: "#52525b" }}>
                    {new Date(r.entryDate).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={{ width: "10%", fontWeight: "bold", fontSize: 7.5, color: "#171717" }}>
                    {r.voucherNo}
                  </Text>
                  <View style={{ width: "28%", paddingRight: 4 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                      <Text style={{ fontWeight: "bold", fontSize: 7.5, color: "#171717" }}>{r.particulars}</Text>
                      {hasItems && (
                        <View style={{ backgroundColor: "#e4e4e7", borderRadius: 99, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 6.2, fontWeight: "bold", color: "#3f3f46" }}>
                            {r.items.length} {r.items.length === 1 ? "item" : "items"}
                          </Text>
                        </View>
                      )}
                      {isPayment && (
                        <View style={{ backgroundColor: "#d1fae5", borderRadius: 99, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 6.2, fontWeight: "bold", color: "#047857" }}>Payment</Text>
                        </View>
                      )}
                    </View>
                    {extras ? <Text style={{ fontSize: 6.8, color: "#52525b", marginTop: 1.5 }}>{extras}</Text> : null}
                  </View>
                  <Text style={{ width: "12%", textAlign: "right", fontWeight: r.debit > 0 ? "bold" : "normal", fontSize: 7.5, color: r.debit > 0 ? "#171717" : "#a1a1aa" }}>
                    {r.debit > 0 ? fmtMoney(r.debit) : "-"}
                  </Text>
                  <Text style={{ width: "11%", textAlign: "right", fontWeight: r.credit > 0 ? "bold" : "normal", fontSize: 7.5, color: r.credit > 0 ? "#047857" : "#a1a1aa" }}>
                    {r.credit > 0 ? fmtMoney(r.credit) : "-"}
                  </Text>
                  <Text style={{ width: "13%", textAlign: "right", fontWeight: "bold", fontSize: 7.5, color: "#171717" }}>
                    {fmtMoney(Math.abs(r.balance))} {r.balance >= 0 ? "Dr" : "Cr"}
                  </Text>
                  <Text style={{ width: "10%", textAlign: "right", fontSize: 6.5, color: "#52525b" }}>
                    {r.builtBy || "-"}
                  </Text>
                </View>

                {/* Nested Items Box — Clearly Tied to Voucher/Bill Number */}
                {hasItems && (
                  <View style={{ marginTop: 6, marginLeft: 10, marginRight: 8, borderWidth: 0.75, borderColor: "#d4d4d8", borderRadius: 5, backgroundColor: "#ffffff", overflow: "hidden" }}>
                    {/* Sub-table Title Bar: "ITEMS IN PO" | "2 line items" */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f4f4f5", borderBottomWidth: 0.75, borderBottomColor: "#e4e4e7", paddingVertical: 3.5, paddingHorizontal: 6 }}>
                      <Text style={{ fontSize: 6.6, fontWeight: "bold", color: "#3f3f46" }}>
                        ITEMS IN {String(r.voucherNo || "ENTRY").toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 6.5, color: "#71717a" }}>
                        {r.items.length} line {r.items.length === 1 ? "item" : "items"}
                      </Text>
                    </View>

                    {/* Sub-table Column Header */}
                    <View style={{ flexDirection: "row", backgroundColor: "#fafafa", borderBottomWidth: 0.75, borderBottomColor: "#e4e4e7", paddingVertical: 3.5, paddingHorizontal: 6, fontWeight: "bold", fontSize: 6.5, color: "#71717a" }}>
                      <Text style={{ flex: 2.5 }}>ITEM</Text>
                      {data.itemColumns.map((c) => (
                        <Text key={c.key} style={{ flex: 1, textAlign: "right" }}>
                          {c.label.toUpperCase()}
                        </Text>
                      ))}
                      <Text style={{ flex: 1.4, textAlign: "right" }}>AMOUNT (Rs.)</Text>
                    </View>

                    {/* Sub-table Rows */}
                    {r.items.map((it, iIdx) => (
                      <View
                        key={iIdx}
                        style={{
                          flexDirection: "row",
                          borderBottomWidth: iIdx < r.items.length - 1 ? 0.5 : 0,
                          borderBottomColor: "#f1f1f2",
                          paddingVertical: 3.5,
                          paddingHorizontal: 6,
                          fontSize: 7,
                        }}
                      >
                        <Text style={{ flex: 2.5, fontWeight: "bold", color: "#171717" }}>
                          {String(it.item ?? "")}
                        </Text>
                        {data.itemColumns.map((c) => {
                          const raw = it[c.key];
                          const text = raw != null && String(raw).trim().length > 0 ? String(raw) : "";
                          return (
                            <Text key={c.key} style={{ flex: 1, textAlign: "right", color: "#52525b" }}>
                              {text}
                            </Text>
                          );
                        })}
                        <Text style={{ flex: 1.4, textAlign: "right", fontWeight: "bold", color: "#171717" }}>
                          {fmtMoney(Number(it.amount || 0))}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {/* Closing Total Row */}
          <View style={{ flexDirection: "row", backgroundColor: "#f4f4f5", paddingVertical: 7, paddingHorizontal: 6, fontWeight: "bold", fontSize: 8 }}>
            <Text style={{ width: "54%", textAlign: "right", paddingRight: 8, color: "#3f3f46" }}>
              TOTAL / CLOSING BALANCE
            </Text>
            <Text style={{ width: "12%", textAlign: "right", color: "#171717" }}>
              Rs.{fmtMoney(data.totalDebit)}
            </Text>
            <Text style={{ width: "11%", textAlign: "right", color: "#047857" }}>
              Rs.{fmtMoney(data.totalCredit)}
            </Text>
            <Text style={{ width: "23%", textAlign: "right", color: "#171717" }}>
              Rs.{fmtMoney(Math.abs(data.closingBalance))} {data.closingBalance >= 0 ? "Dr" : "Cr"}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}

export interface StockValuationPdfData {
  tenantName: string;
  logoUrl?: string | null;
  branchScopeLabel: string;
  generatedAt: string;
  showCostAndProfit: boolean;
  summary: {
    totalProducts: number;
    totalUnits: number;
    totalStockCost: number;
    totalRetailValue: number;
    totalWholesaleValue: number;
    expectedRetailProfit: number;
    expectedWholesaleProfit: number;
    retailMarginPct: number;
    wholesaleMarginPct: number;
  };
  products: Array<{
    model_code: string;
    product_name: string;
    category: string;
    uom: string;
    stock_qty: number;
    unit_cost: number;
    unit_retail: number;
    unit_wholesale: number;
    total_cost: number;
    total_retail_value: number;
    total_wholesale_value: number;
    expected_retail_profit: number;
    expected_wholesale_profit: number;
  }>;
}

export async function renderStockValuationPdfBuffer(data: StockValuationPdfData): Promise<Buffer> {
  const fmt = (n: number) =>
    `Rs.${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={{ padding: 20, fontSize: 8, fontFamily: "Helvetica", color: "#0f172a" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: "#0f172a", paddingBottom: 8, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {data.logoUrl ? (
              <Image src={data.logoUrl} style={{ width: 38, height: 38, objectFit: "contain" }} />
            ) : null}
            <View>
              <Text style={{ fontSize: 14, fontWeight: "bold" }}>{data.tenantName}</Text>
              <Text style={{ fontSize: 8.5, color: "#475569" }}>STOCK VALUATION &amp; EXPECTED OUTCOME REPORT</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8.5, fontWeight: "bold" }}>Scope: {data.branchScopeLabel}</Text>
            <Text style={{ fontSize: 7.5, color: "#475569" }}>Generated: {data.generatedAt}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1, backgroundColor: "#f8fafc", borderWidth: 0.75, borderColor: "#cbd5e1", borderRadius: 4, padding: 6 }}>
            <Text style={{ fontSize: 7, color: "#475569" }}>TOTAL STOCK</Text>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 2 }}>{data.summary.totalUnits.toLocaleString("en-IN")} units</Text>
            <Text style={{ fontSize: 7, color: "#64748b" }}>{data.summary.totalProducts} products</Text>
          </View>
          {data.showCostAndProfit && (
            <View style={{ flex: 1, backgroundColor: "#f8fafc", borderWidth: 0.75, borderColor: "#cbd5e1", borderRadius: 4, padding: 6 }}>
              <Text style={{ fontSize: 7, color: "#475569" }}>TOTAL STOCK COST</Text>
              <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 2 }}>{fmt(data.summary.totalStockCost)}</Text>
              <Text style={{ fontSize: 7, color: "#64748b" }}>Our total investment</Text>
            </View>
          )}
          <View style={{ flex: 1, backgroundColor: "#f0fdf4", borderWidth: 0.75, borderColor: "#86efac", borderRadius: 4, padding: 6 }}>
            <Text style={{ fontSize: 7, color: "#166534" }}>RETAIL SALE VALUE</Text>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 2, color: "#14532d" }}>{fmt(data.summary.totalRetailValue)}</Text>
            {data.showCostAndProfit && (
              <Text style={{ fontSize: 7, color: "#15803d" }}>
                Profit: {fmt(data.summary.expectedRetailProfit)} ({data.summary.retailMarginPct.toFixed(1)}%)
              </Text>
            )}
          </View>
          <View style={{ flex: 1, backgroundColor: "#f0f9ff", borderWidth: 0.75, borderColor: "#7dd3fc", borderRadius: 4, padding: 6 }}>
            <Text style={{ fontSize: 7, color: "#075985" }}>WHOLESALE SALE VALUE</Text>
            <Text style={{ fontSize: 11, fontWeight: "bold", marginTop: 2, color: "#0c4a6e" }}>{fmt(data.summary.totalWholesaleValue)}</Text>
            {data.showCostAndProfit && (
              <Text style={{ fontSize: 7, color: "#0369a1" }}>
                Profit: {fmt(data.summary.expectedWholesaleProfit)} ({data.summary.wholesaleMarginPct.toFixed(1)}%)
              </Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: "#0f172a", color: "#ffffff", paddingVertical: 5, paddingHorizontal: 4, fontWeight: "bold", fontSize: 7.5 }}>
          <Text style={{ width: "22%" }}>Product / Code</Text>
          <Text style={{ width: "10%" }}>Category</Text>
          <Text style={{ width: "8%", textAlign: "right" }}>Stock</Text>
          {data.showCostAndProfit && <Text style={{ width: "9%", textAlign: "right" }}>Unit Cost</Text>}
          <Text style={{ width: "9%", textAlign: "right" }}>Retail</Text>
          <Text style={{ width: "9%", textAlign: "right" }}>Wholesale</Text>
          {data.showCostAndProfit && <Text style={{ width: "11%", textAlign: "right" }}>Total Cost</Text>}
          <Text style={{ width: "11%", textAlign: "right" }}>Retail Val</Text>
          <Text style={{ width: "11%", textAlign: "right" }}>Wholesale Val</Text>
        </View>

        {data.products.map((p, idx) => (
          <View key={idx} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3.5, paddingHorizontal: 4, fontSize: 7.5 }} wrap={false}>
            <Text style={{ width: "22%" }}>{p.product_name} ({p.model_code})</Text>
            <Text style={{ width: "10%", color: "#475569" }}>{p.category}</Text>
            <Text style={{ width: "8%", textAlign: "right", fontWeight: "bold" }}>{p.stock_qty} {p.uom}</Text>
            {data.showCostAndProfit && <Text style={{ width: "9%", textAlign: "right" }}>{fmt(p.unit_cost)}</Text>}
            <Text style={{ width: "9%", textAlign: "right" }}>{fmt(p.unit_retail)}</Text>
            <Text style={{ width: "9%", textAlign: "right" }}>{fmt(p.unit_wholesale)}</Text>
            {data.showCostAndProfit && <Text style={{ width: "11%", textAlign: "right" }}>{fmt(p.total_cost)}</Text>}
            <Text style={{ width: "11%", textAlign: "right", fontWeight: "bold" }}>{fmt(p.total_retail_value)}</Text>
            <Text style={{ width: "11%", textAlign: "right" }}>{fmt(p.total_wholesale_value)}</Text>
          </View>
        ))}

        <View style={{ flexDirection: "row", borderTopWidth: 1.5, borderTopColor: "#0f172a", backgroundColor: "#f8fafc", paddingVertical: 5, paddingHorizontal: 4, marginTop: 4, fontWeight: "bold", fontSize: 8 }}>
          <Text style={{ width: "32%" }}>GRAND TOTAL ({data.summary.totalProducts} products)</Text>
          <Text style={{ width: "8%", textAlign: "right" }}>{data.summary.totalUnits}</Text>
          <Text style={{ width: data.showCostAndProfit ? "27%" : "18%" }} />
          {data.showCostAndProfit && <Text style={{ width: "11%", textAlign: "right" }}>{fmt(data.summary.totalStockCost)}</Text>}
          <Text style={{ width: "11%", textAlign: "right" }}>{fmt(data.summary.totalRetailValue)}</Text>
          <Text style={{ width: "11%", textAlign: "right" }}>{fmt(data.summary.totalWholesaleValue)}</Text>
        </View>
      </Page>
    </Document>
  );

  return Buffer.from(await renderToBuffer(doc));
}
