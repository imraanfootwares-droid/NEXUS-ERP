/** Pure helpers shared by the POS screen and the server. */

/** Returns a 10-digit number, removing a +91 or leading 0, or null if it is not valid. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[1-9]\d{9}$/.test(digits) ? digits : null;
}

export function normalizeGstin(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toUpperCase();
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(value) ? value : null;
}

/** A customer record needs a name; an unnamed walk-in is labelled by their contact. */
export function walkInDisplayName(
  name: string | null | undefined,
  phone: string | null,
  gstin: string | null
): string {
  const clean = (name ?? "").trim();
  if (clean && clean.toLowerCase() !== "walk-in customer") return clean.slice(0, 120);
  return `Customer ${phone ?? gstin}`;
}
