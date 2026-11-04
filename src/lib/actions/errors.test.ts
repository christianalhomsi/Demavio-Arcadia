import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, mapBackendError } from "./errors";

describe("mapBackendError", () => {
  it("maps contract codes raised as P0001", () => {
    const r = mapBackendError({ code: "P0001", message: "INSUFFICIENT_FUNDS" });
    expect(r).toMatchObject({ ok: false, code: "INSUFFICIENT_FUNDS" });
  });
  it("maps RLS/privilege errors to FORBIDDEN", () => {
    expect(mapBackendError({ code: "42501" })).toMatchObject({ code: "FORBIDDEN" });
  });
  it("maps unique violations to DUPLICATE", () => {
    expect(mapBackendError({ code: "23505" })).toMatchObject({ code: "DUPLICATE" });
  });
  it("never leaks raw backend text for unknown errors", () => {
    const r = mapBackendError({ code: "XX000", message: 'relation "secret_table" failed' });
    expect(r).toMatchObject({ code: "UNKNOWN", message: ERROR_MESSAGES.UNKNOWN });
    expect(JSON.stringify(r)).not.toContain("secret_table");
  });
  it("handles null", () => {
    expect(mapBackendError(null)).toMatchObject({ code: "UNKNOWN" });
  });
});

describe("mapBackendError details", () => {
  it("surfaces known detail tokens as friendly messages", () => {
    const r = mapBackendError({
      code: "P0001",
      message: "PRECONDITION_FAILED",
      details: "last_owner",
    });
    expect(r).toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("at least one active owner"),
    });
  });
  it("names the field for validation errors", () => {
    expect(
      mapBackendError({ code: "P0001", message: "VALIDATION", details: "email" }),
    ).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { email: expect.any(String) },
    });
  });
  it("drops untrusted details", () => {
    const r = mapBackendError({
      code: "P0001",
      message: "CONFLICT",
      details: "Key (x)=(secret) exists",
    });
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});
