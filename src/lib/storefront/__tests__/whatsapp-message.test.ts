import { describe, expect, it } from "vitest";
import { buildStructuredWhatsAppMessage } from "../whatsapp-message";

describe("Structured Storefront WhatsApp Inquiry Message", () => {
  it("groups multiple sizes & colours under each product with totals and product/photo links", () => {
    const msg = buildStructuredWhatsAppMessage({
      tenantName: "Imraan Footwear",
      slug: "imraan-footwear",
      origin: "https://shop.example.com",
      customerName: "Rajesh Kumar",
      customerContact: "+91 9876543210",
      message: "Deliver to Chennai",
      items: [
        {
          productId: "p1",
          variantId: "v1",
          name: "AeroStride Runner",
          modelCode: "IMR-201",
          sku: "IMR-201-UK8-BLA",
          attrs: "UK 8 / Black",
          uom: "Pair",
          price: 1599,
          qty: 100,
          imageUrl: "https://cdn.example.com/aero.jpg",
        },
        {
          productId: "p1",
          variantId: "v2",
          name: "AeroStride Runner",
          modelCode: "IMR-201",
          sku: "IMR-201-UK9-TAN",
          attrs: "UK 9 / Tan",
          uom: "Pair",
          price: 1599,
          qty: 150,
          imageUrl: "https://cdn.example.com/aero.jpg",
        },
      ],
    });

    expect(msg).toContain("*NEW ORDER INQUIRY — Imraan Footwear*");
    expect(msg).toContain("*1. AeroStride Runner* (Code: IMR-201)");
    expect(msg).toContain("UK 8 / Black — *100 pairs* × ₹1,599 = ₹1,59,900");
    expect(msg).toContain("UK 9 / Tan — *150 pairs* × ₹1,599 = ₹2,39,850");
    expect(msg).toContain("View Product: https://shop.example.com/s/imraan-footwear/product/p1");
    expect(msg).toContain("Photo: https://cdn.example.com/aero.jpg");
    expect(msg).toContain("*Total Quantity:* 250 units");
    expect(msg).toContain("*Estimated Total:* ₹3,99,750");
    expect(msg).toContain("Name: Rajesh Kumar");
  });
});
