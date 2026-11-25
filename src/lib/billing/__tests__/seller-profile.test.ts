import { describe, expect, it } from "vitest";
import {
  GST_TEMPLATE_PRESETS,
  NORMAL_TEMPLATE_PRESETS,
  buildDefaultConfigForCategory,
  inferTemplateCategory,
  resolveSellerProfile,
  selectTemplateForBill,
} from "../seller-profile";
import { amountInWordsIndian } from "@/lib/gst/calculator";
import { renderInvoicePdfBuffer, renderPartyLedgerPdfBuffer } from "@/lib/pdf/documents";
import type { BillTemplateRow, TenantRow } from "@/types/database";

const mockTenant: Pick<TenantRow, "name" | "brand_config"> = {
  name: "Hayath Enterprises",
  brand_config: {
    primary_color: "#1d528a",
    business_profile: {
      business_name: "HAYATH ENTERPRISES",
      address: "NO : 19, KATTUR SADAYAPPAN, STREET, PERIAMET, CHENNAI - 600003, TAMIL NADU, INDIA.",
      phone: "+91 7010345550",
      email: "hayathenterprisess@gmail.com",
      gstin: "33aghpi7481e1zg",
      signatory_name: "Hayath Enterprises",
      bank_details: {
        account_holder: "HAYATH ENTERPRISES",
        bank_name: "J&K BANK",
        account_number: "2222010100000960",
        ifsc_code: "jaka0parrys",
      },
    },
  },
};

describe("Seller Profile, 5 Normal + 5 GST Bill Templates & PDF Generation", () => {
  it("resolves all static seller & bank details from Profile and uppercases GSTIN/IFSC", () => {
    const seller = resolveSellerProfile(mockTenant);
    expect(seller.businessName).toBe("HAYATH ENTERPRISES");
    expect(seller.address).toContain("PERIAMET");
    expect(seller.phone).toBe("+91 7010345550");
    expect(seller.email).toBe("hayathenterprisess@gmail.com");
    expect(seller.gstin).toBe("33AGHPI7481E1ZG");
    expect(seller.hasBankDetails).toBe(true);
    expect(seller.bankDetails.bank_name).toBe("J&K BANK");
    expect(seller.bankDetails.account_number).toBe("2222010100000960");
    expect(seller.bankDetails.ifsc_code).toBe("JAKA0PARRYS");
  });

  it("falls back to branch details when Profile is not yet filled", () => {
    const seller = resolveSellerProfile(
      { name: "Demo Shop", brand_config: {} },
      { name: "Main Branch", address: "T. Nagar, Chennai", phone: "9876543210", gstin: "33AABCI1234F1Z2" }
    );
    expect(seller.businessName).toBe("Demo Shop");
    expect(seller.address).toBe("T. Nagar, Chennai");
    expect(seller.phone).toBe("9876543210");
    expect(seller.gstin).toBe("33AABCI1234F1Z2");
    expect(seller.hasBankDetails).toBe(false);
  });

  it("provides exactly 5 unique GST layouts and 5 unique Normal layouts", () => {
    expect(GST_TEMPLATE_PRESETS).toHaveLength(5);
    expect(NORMAL_TEMPLATE_PRESETS).toHaveLength(5);

    const gstStyles = new Set(GST_TEMPLATE_PRESETS.map((p) => p.design_style));
    const normalStyles = new Set(NORMAL_TEMPLATE_PRESETS.map((p) => p.design_style));
    expect(gstStyles.size).toBe(5);
    expect(normalStyles.size).toBe(5);
    expect(GST_TEMPLATE_PRESETS.every((p) => p.billCategory === "gst" && p.show_gst_summary)).toBe(true);
    expect(NORMAL_TEMPLATE_PRESETS.every((p) => p.billCategory === "normal" && !p.show_gst_summary)).toBe(true);
  });

  it("selects the saved GST default for GST bills and Normal default for Normal bills", () => {
    const seller = resolveSellerProfile(mockTenant);
    const saved: BillTemplateRow[] = [
      {
        id: "tpl-normal",
        tenant_id: "t1",
        name: "Bold Color Header",
        format: "a4",
        is_default: true,
        config: {
          ...buildDefaultConfigForCategory("normal", seller),
          design_style: "normal_banner",
        },
      },
      {
        id: "tpl-gst",
        tenant_id: "t1",
        name: "Classic Tax Grid",
        format: "a4",
        is_default: true,
        config: {
          ...buildDefaultConfigForCategory("gst", seller),
          design_style: "gst_classic_grid",
        },
      },
    ];

    expect(inferTemplateCategory(saved[0])).toBe("normal");
    expect(inferTemplateCategory(saved[1])).toBe("gst");
    expect(selectTemplateForBill(saved, true)?.id).toBe("tpl-gst");
    expect(selectTemplateForBill(saved, false)?.id).toBe("tpl-normal");
  });

  it("formats Indian amount in words with paise matching the sample GST invoice", () => {
    expect(amountInWordsIndian(166744.2)).toBe(
      "Rupees One Lakh Sixty Six Thousand Seven Hundred Forty Four and Twenty Paise Only"
    );
    expect(amountInWordsIndian(158804)).toBe(
      "Rupees One Lakh Fifty Eight Thousand Eight Hundred Four Only"
    );
  });

  it("renders a valid PDF invoice buffer with Profile Seller, Bank Details, and Buyer/Ship-To", async () => {
    const seller = resolveSellerProfile(mockTenant);
    const pdf = await renderInvoicePdfBuffer({
      tenantName: seller.businessName,
      branchName: "Chennai Main",
      branchAddress: seller.address,
      branchPhone: seller.phone,
      branchEmail: seller.email,
      branchGstin: seller.gstin,
      signatoryName: seller.signatoryName,
      bankDetails: seller.bankDetails,
      invoiceNumber: "220",
      invoiceType: "sale",
      createdAt: "2026-06-27T10:00:00.000Z",
      customerName: "POTHYS RETAIL PVT LIMITED",
      customerAddress: "JLS Godown, Puzhal, Chennai - 600 066",
      customerGstin: "33AALCP2218B1ZX",
      shipToName: "POTHYS RETAIL PVT LIMITED",
      shipToAddress: "No : 81, RLDA, Padi, Chennai - 600 050",
      placeOfSupply: "Tamil Nadu (33)",
      supplyType: "intra_state",
      subtotal: 158804,
      discountAmount: 0,
      taxableAmount: 158804,
      cgstAmount: 3970.1,
      sgstAmount: 3970.1,
      igstAmount: 0,
      roundOff: 0,
      grandTotal: 166744.2,
      paidAmount: 166744.2,
      dueAmount: 0,
      showHsn: true,
      showGst: true,
      items: [
        {
          product_name: "LADIES ORTHO ART NO : 101",
          hsn_code: "64039110",
          qty: 120,
          unit_price: 100,
          gst_rate: 5,
          line_total: 12600,
        },
      ],
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("renders a valid Party Ledger PDF buffer with grouped voucher items", async () => {
    const pdf = await renderPartyLedgerPdfBuffer({
      tenantName: "Imraan Footwear",
      partyName: "Agra Leather & Soles Co.",
      partyType: "supplier",
      partyPhone: "9811122334",
      partyGstin: "09AABCA5678G1Z9",
      itemColumns: [
        { key: "colour", label: "Colour" },
        { key: "size", label: "Size" },
        { key: "qty", label: "Pair / Qty" },
        { key: "rate", label: "Rate" },
      ],
      headerFields: [],
      rows: [
        {
          entryDate: "2026-11-24T12:57:00.000Z",
          voucherNo: "PO",
          particulars: "Purchase (finished goods)",
          debit: 104000,
          credit: 0,
          balance: 154000,
          extraFields: {},
          items: [
            { item: "Comfort Slide Pro - UK 7 / Black", colour: "Black", size: "UK 7", qty: 200, rate: "210.00", amount: 42000 },
            { item: "AeroStride Runner - UK 7 / Black", colour: "Black", size: "UK 7", qty: 100, rate: "620.00", amount: 62000 },
          ],
          builtBy: "Imraan Khan (@imraan)",
        },
      ],
      totalDebit: 174000,
      totalCredit: 20000,
      closingBalance: 154000,
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
