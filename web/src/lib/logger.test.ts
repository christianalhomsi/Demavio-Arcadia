import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("masks sensitive keys recursively", () => {
    expect(redact({ a: 1, accessToken: "x", n: { password: "p", ok: true } })).toEqual({
      a: 1,
      accessToken: "[REDACTED]",
      n: { password: "[REDACTED]", ok: true },
    });
  });
});
