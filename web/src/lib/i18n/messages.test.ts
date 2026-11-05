import { describe, expect, it } from "vitest";
import { messages } from "./messages";

/** Values that are legitimately the same in both languages (brand names, units, symbols). */
const SAME = new Set([
  "brand",
  "tagline",
  "email",
  "pc",
  "dvPC",
  "colInvoice",
  "pdLineQty",
  "wnLine",
  "pkUsedAt",
  "dcPercentOf",
  "pyBy",
  "pyRefundLine",
]);

describe("dictionaries", () => {
  it("have the same keys in both languages", () => {
    expect(Object.keys(messages.ar).sort()).toEqual(Object.keys(messages.en).sort());
  });
  it("never leave an Arabic value identical to English by accident", () => {
    const same = Object.keys(messages.en).filter(
      (k) =>
        !SAME.has(k) &&
        messages.en[k as keyof typeof messages.en] === messages.ar[k as keyof typeof messages.ar],
    );
    expect(same).toEqual([]);
  });
  it("keep placeholders identical across languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    const bad = Object.keys(messages.en).filter(
      (k) =>
        ph(messages.en[k as keyof typeof messages.en]) !==
        ph(messages.ar[k as keyof typeof messages.ar]),
    );
    expect(bad).toEqual([]);
  });
});
