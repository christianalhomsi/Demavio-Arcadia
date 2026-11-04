import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static security guards (SEC-003, SEC-005). They read the source tree, so a new Server Action or a
 * stray secret reference fails CI instead of relying on review.
 */

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const src = walk(join(ROOT, "src"));
const isTest = (f: string) => /\.test\.tsx?$/.test(f);

describe("no service-role key in the web app (ADR-004)", () => {
  it("never references the service role in source or env templates", () => {
    const files = [...src.filter((f) => !isTest(f)), join(ROOT, ".env.example")];
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8")
        .split("\n")
        // the .env.example warning line is documentation, not a reference
        .filter((l) => !/NEVER add/.test(l) && !/^\s*(\/\/|\/?\*)/.test(l)) // comments are documentation
        .join("\n");
      return /service[_-]?role/i.test(text) || /SUPABASE_SERVICE/.test(text);
    });
    expect(offenders).toEqual([]);
  });
  it("does not put secrets in NEXT_PUBLIC_ variables", () => {
    const env = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(env).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE|PASSWORD)/);
  });
  it("the built client bundle (if present) contains no service-role reference", () => {
    const dir = join(ROOT, ".next", "static");
    if (!existsSync(dir)) return;
    const hit = walk(dir)
      .filter((f) => /\.(js|css|html)$/.test(f))
      .filter((f) => /service_role|SUPABASE_SERVICE/i.test(readFileSync(f, "utf8")));
    expect(hit).toEqual([]);
  }, 60_000);
});

/**
 * Actions that are deliberately not hall/platform-permission gated, with the reason. Adding to this list
 * needs a review: it means the database function is the only authority.
 */
const EXEMPT = new Set([
  // The invitation token is the proof; accept_invitation also requires the signed-in Google account
  // email to match the invited address (spec §5.3).
  "acceptInvitationAction",
  // Players have no hall permission by definition. The action requires a signed-in active account and
  // create_player_reservation books only for auth.uid() (never a client-supplied customer), and
  // re-checks device/hall status, working hours, overlap and per-player limits.
  "createPlayerReservationAction",
  // Read-only price estimate on public data (the quote RPC is granted to anon on purpose).
  "quotePriceAction",
  // Cancels only the caller's own booking: the RPC matches customer_id = auth.uid() and the deadline.
  "cancelMyReservationAction",
  // Sets only the caller's own username, once: set_my_username works on auth.uid() and refuses a
  // second change, a name that is taken, or one that is just their account name.
  "setMyUsernameAction",
]);

describe("every Server Action authorizes on the server (SEC-005)", () => {
  const actionFiles = src.filter((f) => /[\\/]actions\.ts$/.test(f));

  it("finds the action files (guards against a silent glob miss)", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(10);
    for (const f of actionFiles) expect(readFileSync(f, "utf8")).toMatch(/^"use server";/);
  });

  it("each exported action goes through withPermission / withPlatformRole", () => {
    const bad: string[] = [];
    for (const f of actionFiles) {
      const text = readFileSync(f, "utf8");
      const parts = text.split(/^export (?=async function|const )/m).slice(1);
      for (const part of parts) {
        const name = /^(?:async function|const) (\w+)/.exec(part)?.[1] ?? "?";
        if (EXEMPT.has(name)) continue;
        // setStatus() is the shared platform helper that itself wraps withPlatformRole.
        if (!/withPermission\(|withPlatformRole\(|setStatus\(/.test(part))
          bad.push(`${f}: ${name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the shared helper really wraps the platform guard", () => {
    const admin = readFileSync(join(ROOT, "src", "features", "admin", "actions.ts"), "utf8");
    expect(admin).toMatch(/async function setStatus[\s\S]*?withPlatformRole\("super_admin"/);
  });

  it("actions validate ids with isUuid and never trust a client-supplied hall for permission", () => {
    for (const f of actionFiles) {
      const text = readFileSync(f, "utf8");
      // hall-scoped actions take hallId first and hand it to withPermission, which checks membership.
      if (/withPermission\(/.test(text)) expect(text, f).toMatch(/withPermission\(\s*hallId\s*,/);
    }
  });
});

describe("no hall financial data is read by platform or sales code", () => {
  it("admin and sales features never touch finance RPCs or tables", () => {
    const finance =
      /(list_invoices|list_wallets|list_shifts|list_registers|list_refunds|report_financial_summary|record_cash|wallet_top_up|["']payments["']|["']invoices["']|["']wallets["'])/;
    const files = src.filter((f) => /[\\/]features[\\/](admin|sales)[\\/]/.test(f) && !isTest(f));
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((f) => finance.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
