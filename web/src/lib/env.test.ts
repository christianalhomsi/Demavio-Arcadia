import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const ok = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts valid env and defaults APP_ENV", () => {
    expect(parseEnv(ok).APP_ENV).toBe("development");
  });
  it("fails without leaking values", () => {
    expect(() => parseEnv({ ...ok, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })).toThrow(/ANON_KEY/);
  });
});
