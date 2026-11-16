// Display and input parsing only. Authoritative amounts always come from the backend (§10.2).

export function formatMoney(minor: number, currency: string, locale = "en"): string {
  const digits =
    new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** digits,
  );
}

/**
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits become ASCII and the Arabic decimal separator (٫) becomes
 * ".". Thousands separators ("," or "٬") are dropped only in proper groups of three ("5,000", "٥٬٠٠٠");
 * anything else, such as "1,5", is left alone and rejected rather than misread as 15.
 */
export function normalizeNumberInput(input: string): string {
  const ascii = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
  return /^\d{1,3}([,٬]\d{3})+(\.\d+)?$/.test(ascii) ? ascii.replace(/[,٬]/g, "") : ascii;
}

/** Parses a user-typed decimal ("12.50") into integer minor units. Returns null if invalid. */
export function parseMoneyInput(input: string, fractionDigits = 2): number | null {
  const trimmed = normalizeNumberInput(input);
  // Zero-decimal currencies (JPY) take whole numbers only; `{1,0}` would be an invalid pattern.
  const re =
    fractionDigits === 0 ? /^\d+$/ : new RegExp(String.raw`^\d+(\.\d{1,${fractionDigits}})?$`);
  if (!re.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  return Number(whole) * 10 ** fractionDigits + Number(frac.padEnd(fractionDigits, "0") || 0);
}

/** Number of decimal places of a currency's minor unit (2 for USD, 0 for JPY, 3 for KWD...). */
export function currencyFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Parses what a person typed ("12.50") into minor units for THIS currency. Input conversion only. */
export function parseMoneyForCurrency(input: string, currency: string): number | null {
  return parseMoneyInput(input, currencyFractionDigits(currency));
}

/** Minor units -> editable text ("12.50"). Display/prefill only; never used for calculations. */
export function minorToInput(minor: number, currency: string): string {
  const d = currencyFractionDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}
