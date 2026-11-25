import { describe, expect, it } from "vitest";
import { splitPhoneValue } from "../whatsapp-phone-input";

describe("WhatsAppPhoneInput phone splitting", () => {
  it("splits full Indian and international numbers cleanly", () => {
    expect(splitPhoneValue("917010345550")).toEqual({ code: "91", local: "7010345550" });
    expect(splitPhoneValue("+91 98765 43210")).toEqual({ code: "91", local: "9876543210" });
    expect(splitPhoneValue("971501234567")).toEqual({ code: "971", local: "501234567" });
  });

  it("handles empty and local-only numbers without duplicating prefixes", () => {
    expect(splitPhoneValue("")).toEqual({ code: "91", local: "" });
    expect(splitPhoneValue("9876543210")).toEqual({ code: "91", local: "9876543210" });
  });
});
