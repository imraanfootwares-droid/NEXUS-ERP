"use client";

import React, { useMemo } from "react";
import { Input, Select } from "./primitives";

export const COUNTRY_CODES = [
  { code: "91", label: "IN (+91)" },
  { code: "971", label: "AE (+971)" },
  { code: "966", label: "SA (+966)" },
  { code: "44", label: "UK (+44)" },
  { code: "1", label: "US (+1)" },
  { code: "65", label: "SG (+65)" },
  { code: "60", label: "MY (+60)" },
  { code: "974", label: "QA (+974)" },
  { code: "968", label: "OM (+968)" },
  { code: "965", label: "KW (+965)" },
  { code: "973", label: "BH (+973)" },
  { code: "61", label: "AU (+61)" },
  { code: "977", label: "NP (+977)" },
  { code: "880", label: "BD (+880)" },
  { code: "94", label: "LK (+94)" },
  { code: "254", label: "KE (+254)" },
  { code: "27", label: "ZA (+27)" },
  { code: "49", label: "DE (+49)" },
  { code: "33", label: "FR (+33)" },
] as const;

// Sort longest-first when matching prefixes so "971" matches before "91"/"1"
const MATCH_ORDER = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function splitPhoneValue(raw: string): { code: string; local: string } {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return { code: "91", local: "" };
  for (const item of MATCH_ORDER) {
    if (digits.startsWith(item.code) && digits.length > item.code.length + 5) {
      return { code: item.code, local: digits.slice(item.code.length) };
    }
  }
  return { code: "91", local: digits };
}

export function WhatsAppPhoneInput({
  value,
  onChange,
  placeholder = "9876543210",
  disabled,
}: {
  value: string;
  onChange: (combinedDigits: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => splitPhoneValue(value), [value]);
  const [preferredCode, setPreferredCode] = React.useState(parsed.code);
  const code = parsed.local ? parsed.code : preferredCode;
  const local = parsed.local;

  const handleCodeChange = (nextCode: string) => {
    setPreferredCode(nextCode);
    if (local) {
      onChange(`${nextCode}${local}`);
    }
  };

  const handleLocalChange = (nextLocalRaw: string) => {
    const cleanLocal = nextLocalRaw.replace(/\D/g, "").slice(0, 15);
    onChange(cleanLocal ? `${code}${cleanLocal}` : "");
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-[118px] shrink-0">
        <Select
          aria-label="Country code"
          value={code}
          disabled={disabled}
          onChange={(e) => handleCodeChange(e.target.value)}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <Input
        type="tel"
        inputMode="numeric"
        value={local}
        disabled={disabled}
        onChange={(e) => handleLocalChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
    </div>
  );
}
