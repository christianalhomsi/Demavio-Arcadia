import { describe, expect, it } from "vitest";
import { runAuthorized } from "@/lib/actions/authorized";
import { ok } from "@/lib/actions/result";
import { authorizeHall, authorizePlatform } from "@/lib/auth/authorize";
import { HALL_NAV } from "@/components/shell/nav";
import { HALLS, PERSONAS, type PersonaName } from "./personas";

/**
 * Authorization matrix (TEST-002): persona x hall x route. Expected outcomes are written by hand
 * from the specification (§4, §21, §24.4), NOT derived from the code under test.
 * New hall routes must be added to HALL_NAV, which makes them appear here automatically.
 */

type Outcome = "ok" | "forbidden" | "not_found";

const ALL_LABELS = HALL_NAV.flatMap((g) => g.items.map((i) => i.label));
const OWNER_ONLY = [
  "Reports",
  "Pricing",
  "Adjustments",
  "Expenses",
  "Packages",
  "Discounts",
  "Employees",
  "Settings",
  "Audit log",
];
const EMPLOYEE_LABELS = ALL_LABELS.filter((l) => !OWNER_ONLY.includes(l));

/** What each persona may open in a hall where they are an active member. */
const MEMBER_ALLOWED: Partial<Record<PersonaName, string[]>> = {
  ownerH1H2: ALL_LABELS,
  employeeH1: EMPLOYEE_LABELS,
  ownerH3: ALL_LABELS,
};

/** Halls where each persona is an active member. */
const MEMBER_OF: Partial<Record<PersonaName, string[]>> = {
  ownerH1H2: [HALLS.h1, HALLS.h2],
  employeeH1: [HALLS.h1],
  ownerH3: [HALLS.h3],
};

function expected(persona: PersonaName, hallId: string, label: string): Outcome {
  if (!MEMBER_OF[persona]?.includes(hallId)) return "not_found";
  return MEMBER_ALLOWED[persona]?.includes(label) ? "ok" : "forbidden";
}

const routes = HALL_NAV.flatMap((g) => g.items);

describe("hall route authorization matrix", () => {
  for (const persona of Object.keys(PERSONAS) as PersonaName[]) {
    for (const hallId of Object.values(HALLS)) {
      for (const item of routes) {
        it(`${persona} -> ${hallId.slice(-1)} ${item.label}`, () => {
          const got = authorizeHall(PERSONAS[persona], hallId, item.permission).status;
          expect(got).toBe(expected(persona, hallId, item.label));
        });
      }
    }
  }
});

describe("membership-only guard (layout)", () => {
  it("lets members in and returns 404 for everyone else", () => {
    expect(authorizeHall(PERSONAS.employeeH1, HALLS.h1).status).toBe("ok");
    for (const p of [
      "ownerH3",
      "superAdmin",
      "salesAgent",
      "customerOnly",
      "deactivated",
      "employeeInactiveHall",
    ] as const) {
      expect(authorizeHall(PERSONAS[p], HALLS.h1).status).toBe("not_found");
    }
  });
  it("treats malformed or forged hall ids as not found", () => {
    for (const bad of [
      "",
      "abc",
      "../admin",
      `${HALLS.h1}' or '1'='1`,
      "00000000-0000-0000-0000-000000000000",
    ]) {
      expect(authorizeHall(PERSONAS.ownerH1H2, bad).status).toBe("not_found");
    }
  });
  it("super admin and sales get no hall access by role alone", () => {
    for (const hallId of Object.values(HALLS)) {
      expect(authorizeHall(PERSONAS.superAdmin, hallId, "refund.approve").status).toBe("not_found");
      expect(authorizeHall(PERSONAS.salesAgent, hallId, "invoice.view").status).toBe("not_found");
    }
  });
});

describe("platform areas", () => {
  it("/admin is super admin only (404 for everyone else)", () => {
    for (const [name, c] of Object.entries(PERSONAS)) {
      const want = name === "superAdmin" ? "ok" : "not_found";
      expect(authorizePlatform(c, "super_admin").status, name).toBe(want);
    }
  });
  it("/sales admits sales roles only", () => {
    expect(authorizePlatform(PERSONAS.salesAgent, ["sales_agent", "sales_admin"]).status).toBe(
      "ok",
    );
    expect(authorizePlatform(PERSONAS.ownerH1H2, ["sales_agent", "sales_admin"]).status).toBe(
      "not_found",
    );
  });
});

describe("Server Action guard (runAuthorized)", () => {
  const handler = async () => ok("done");

  it("rejects anonymous callers", async () => {
    const r = await runAuthorized(
      { ctx: null, hallId: HALLS.h1, permission: "payment.collect" },
      handler,
    );
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
  it("runs the handler for permitted members only", async () => {
    const run = (p: PersonaName, hallId: string, perm: Parameters<typeof authorizeHall>[2]) =>
      runAuthorized({ ctx: PERSONAS[p], hallId, permission: perm! }, handler);

    expect(await run("employeeH1", HALLS.h1, "payment.collect")).toEqual({
      ok: true,
      data: "done",
    });
    expect(await run("employeeH1", HALLS.h1, "refund.approve")).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await run("employeeH1", HALLS.h1, "wallet.withdraw")).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await run("employeeH1", HALLS.h2, "payment.collect")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await run("customerOnly", HALLS.h1, "payment.collect")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await run("deactivated", HALLS.h1, "payment.collect")).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await run("ownerH3", HALLS.h1, "refund.approve")).toMatchObject({ code: "NOT_FOUND" });
  });
  it("never invokes the handler when denied", async () => {
    let called = false;
    await runAuthorized(
      { ctx: PERSONAS.salesAgent, hallId: HALLS.h1, permission: "invoice.view" },
      async () => {
        called = true;
        return ok(null);
      },
    );
    expect(called).toBe(false);
  });
});
