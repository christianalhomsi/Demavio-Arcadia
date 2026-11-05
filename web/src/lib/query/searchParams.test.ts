import { describe, expect, it } from "vitest";
import { parseListParams, toRange, withParams } from "./searchParams";

describe("parseListParams", () => {
  it("applies defaults", () => {
    expect(parseListParams({})).toMatchObject({ page: 1, pageSize: 25, dir: "asc", filters: {} });
  });
  it("clamps and sanitizes untrusted input", () => {
    const p = parseListParams({
      page: "-3",
      pageSize: "9999",
      dir: "sideways",
      q: "x".repeat(500),
    });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(100);
    expect(p.dir).toBe("asc");
    expect(p.q).toHaveLength(200);
  });
  it("collects other params as filters", () => {
    expect(parseListParams({ status: "Open", page: "2" }).filters).toEqual({ status: "Open" });
  });
});

describe("toRange", () => {
  it("returns inclusive Supabase range", () => {
    expect(toRange({ page: 3, pageSize: 10 })).toEqual([20, 29]);
  });
});

describe("withParams", () => {
  it("sets and removes keys", () => {
    expect(withParams(new URLSearchParams("a=1&b=2"), { a: undefined, c: "3" })).toBe("b=2&c=3");
  });
});
