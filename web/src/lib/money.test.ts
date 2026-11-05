import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput } from "./money";

describe("parseMoneyInput", () => {
  it("parses decimals to minor units", () => {
    expect(parseMoneyInput("12.5")).toBe(1250);
    expect(parseMoneyInput("0.05")).toBe(5);
    expect(parseMoneyInput("7")).toBe(700);
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "-1", "1.234", "abc", "1,5"]) expect(parseMoneyInput(bad)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats minor units", () => {
    expect(formatMoney(1250, "USD")).toBe("$12.50");
  });
});

describe("currency-aware parsing", () => {
  it("uses the currency's decimal places", async () => {
    const { parseMoneyForCurrency, currencyFractionDigits, minorToInput } = await import("./money");
    expect(currencyFractionDigits("USD")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(parseMoneyForCurrency("12.5", "USD")).toBe(1250);
    expect(parseMoneyForCurrency("500", "JPY")).toBe(500);
    expect(parseMoneyForCurrency("5.5", "JPY")).toBeNull();
    expect(parseMoneyForCurrency("1.234", "KWD")).toBe(1234);
    expect(parseMoneyForCurrency("1.2345", "KWD")).toBeNull();
    expect(minorToInput(1250, "USD")).toBe("12.50");
    expect(minorToInput(500, "JPY")).toBe("500");
  });
});
