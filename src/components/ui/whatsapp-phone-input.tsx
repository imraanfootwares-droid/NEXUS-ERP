"use client";

import React, { useEffect, useRef, useState } from "react";
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

export function splitPhoneValue(raw: string): { code: string; local: string } {
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
  const initial = splitPhoneValue(value);
  const [code, setCode] = useState(initial.code);
  const [local, setLocal] = useState(initial.local);
  // Tracks the last combined string we emitted so typing/backspacing never re-parses
  // and dumps the country code back into the local input field.
  const lastEmittedRef = useRef<string>(value);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const parsed = splitPhoneValue(value);
    setCode(parsed.code);
    setLocal(parsed.local);
  }, [value]);

  const emit = (nextCode: string, nextLocal: string) => {
    const combined = nextLocal ? `${nextCode}${nextLocal}` : "";
    lastEmittedRef.current = combined;
    onChange(combined);
  };

  const handleCodeChange = (nextCode: string) => {
    setCode(nextCode);
    emit(nextCode, local);
  };

  const handleLocalChange = (nextLocalRaw: string) => {
    const cleanLocal = nextLocalRaw.replace(/\D/g, "").slice(0, 15);
    setLocal(cleanLocal);
    emit(code, cleanLocal);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const digits = pasted.replace(/\D/g, "");
    if (!digits) return;
    // Only intercept if user pasted a full international number (e.g. +91 9876543210)
    if (pasted.trim().startsWith("+") || digits.length > 10) {
      e.preventDefault();
      const parsed = splitPhoneValue(digits);
      const cleanLocal = parsed.local.slice(0, 15);
      setCode(parsed.code);
      setLocal(cleanLocal);
      emit(parsed.code, cleanLocal);
    }
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
        onPaste={handlePaste}
        placeholder={placeholder}
        className="flex-1"
      />
    </div>
  );
}
