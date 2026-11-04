import { describe, expect, it } from "vitest";
import { MAX_SESSION_MS, asSessionCookie, loginExpired } from "./session";

describe("asSessionCookie", () => {
  it("drops the lifetime so the cookie ends with the browser session", () => {
    expect(asSessionCookie({ path: "/", maxAge: 34560000 })).toEqual({ path: "/" });
  });
  it("keeps deletions as they are", () => {
    expect(asSessionCookie({ path: "/", maxAge: 0 })).toEqual({ path: "/", maxAge: 0 });
  });
});

describe("loginExpired", () => {
  const t0 = 1_000_000;
  it("is false within 8 hours and true after", () => {
    expect(loginExpired(String(t0), t0 + MAX_SESSION_MS)).toBe(false);
    expect(loginExpired(String(t0), t0 + MAX_SESSION_MS + 1)).toBe(true);
  });
  it("ignores a missing or garbled timer", () => {
    expect(loginExpired(undefined, t0)).toBe(false);
    expect(loginExpired("abc", t0)).toBe(false);
  });
});
