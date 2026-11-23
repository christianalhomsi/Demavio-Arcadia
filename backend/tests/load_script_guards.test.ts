import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The k6 script cannot run in CI, so guard its fail-fast behaviour statically.
const src = readFileSync(join(__dirname, "..", "load", "k6-public-browse.js"), "utf8");

describe("k6 public-browse script guards", () => {
  it("fails the run when any check fails", () => {
    expect(src).toMatch(/checks:\s*\["rate>0\.99"\]/);
  });
  it("aborts in setup when the hall has no devices", () => {
    expect(src).toMatch(/export function setup\(\)[\s\S]*list_public_devices[\s\S]*no active devices/);
  });
  it("validates STAGE, HALL_ID and required env up front", () => {
    expect(src).toMatch(/Number\.isInteger\(STAGE\)/);
    expect(src).toMatch(/UUID\.test\(__ENV\.HALL_ID/);
    expect(src).toMatch(/SUPABASE_URL and ANON_KEY are required/);
  });
});
