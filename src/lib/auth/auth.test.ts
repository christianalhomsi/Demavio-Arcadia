import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/proxy";
import {
  needsUsername,
  postLoginDestination,
  resolveLanding,
  type HallMembership,
  type MyContext,
} from "./context";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNext("/halls/1/devices?x=1")).toBe("/halls/1/devices?x=1");
  });
  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/ok\nSet-Cookie: x=1",
  ])("rejects %j", (bad) => {
    expect(safeNext(bad, "/fallback")).toBe("/fallback");
  });
  it("uses fallback for empty values", () => {
    expect(safeNext(null, "/x")).toBe("/x");
    expect(safeNext(undefined)).toBe("/");
  });
});

const hall = (id: string, over: Partial<HallMembership> = {}): HallMembership => ({
  hall_id: id,
  hall_name: id,
  hall_status: "active",
  role: "employee",
  permissions: ["device.view"],
  discount_limit_minor: null,
  ...over,
});

const ctx = (over: Partial<MyContext> = {}): MyContext => ({
  profile: { id: "u", display_name: null, email: null, status: "active", avatar_url: null },
  platform_roles: [],
  memberships: [],
  ...over,
});

describe("resolveLanding", () => {
  it("sends users without roles to /no-access (authentication is not authorization)", () => {
    expect(resolveLanding(ctx())).toBe("/no-access");
  });
  it("sends inactive profiles to the inactive notice", () => {
    expect(resolveLanding(ctx({ profile: { ...ctx().profile, status: "inactive" } }))).toBe(
      "/no-access?reason=inactive",
    );
  });
  it("sends super admins to /admin", () => {
    expect(resolveLanding(ctx({ platform_roles: ["super_admin"] }))).toBe("/admin");
  });
  it("goes straight to a single active hall", () => {
    expect(resolveLanding(ctx({ memberships: [hall("h1")] }))).toBe("/halls/h1");
  });
  it("asks to choose when several halls are active", () => {
    expect(resolveLanding(ctx({ memberships: [hall("h1"), hall("h2")] }))).toBe("/select-hall");
  });
  it("ignores inactive halls", () => {
    expect(
      resolveLanding(ctx({ memberships: [hall("h1"), hall("h2", { hall_status: "inactive" })] })),
    ).toBe("/halls/h1");
  });
  it("sends sales-only users to /sales", () => {
    expect(resolveLanding(ctx({ platform_roles: ["sales_agent"] }))).toBe("/sales");
  });
});

describe("isPublicPath", () => {
  it("only exposes login and auth routes", () => {
    for (const p of ["/", "/login", "/auth/callback", "/auth/signout"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/halls/1", "/admin", "/no-access", "/select-hall", "/loginx"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("postLoginDestination", () => {
  const profile = {
    id: "u",
    display_name: null,
    email: null,
    status: "active" as const,
    avatar_url: null,
  };
  const player = { profile, platform_roles: [], memberships: [] } as MyContext;
  const owner = { profile, platform_roles: [], memberships: [hall("h1")] } as MyContext;
  const admin = { profile, platform_roles: ["super_admin"], memberships: [] } as MyContext;

  it("sends players back to where they were, or home", () => {
    expect(postLoginDestination(player, "/book/h/d?date=2026-11-02")).toBe(
      "/book/h/d?date=2026-11-02",
    );
    expect(postLoginDestination(player, null)).toBe("/");
    expect(postLoginDestination(player, "//evil.com")).toBe("/");
  });
  it("sends staff to their dashboards, dropping booking links", () => {
    expect(postLoginDestination(owner, "/book/h/d")).toBe("/halls/h1");
    expect(postLoginDestination(owner, null)).toBe("/halls/h1");
    expect(postLoginDestination(admin, "/")).toBe("/admin");
    expect(postLoginDestination(owner, "/halls/h1/devices")).toBe("/halls/h1/devices");
  });
  it("keeps the public booking flow reachable without a session", () => {
    expect(isPublicPath("/book/abc/def")).toBe(true);
    expect(isPublicPath("/halls/abc")).toBe(false);
  });
});

describe("username gate", () => {
  const noName = (over: Partial<MyContext> = {}) =>
    ctx({ profile: { ...ctx().profile, username: null }, ...over });

  it("sends an account without a username to choose one, remembering where it was going", () => {
    expect(postLoginDestination(noName(), "/book/h/d")).toBe(
      "/choose-username?next=%2Fbook%2Fh%2Fd",
    );
    const owner = noName({ memberships: [hall("h1")] });
    expect(postLoginDestination(owner, null)).toBe("/choose-username?next=%2Fhalls%2Fh1");
  });
  it("does not gate accounts that have one, inactive accounts, or old-shaped contexts", () => {
    expect(
      postLoginDestination(ctx({ profile: { ...ctx().profile, username: "sam_9" } }), null),
    ).toBe("/");
    expect(needsUsername(ctx())).toBe(false);
    expect(needsUsername(noName({ profile: { ...noName().profile, status: "inactive" } }))).toBe(
      false,
    );
    expect(needsUsername(noName())).toBe(true);
  });
  it("drops an unsafe next target", () => {
    expect(postLoginDestination(noName(), "https://evil.example")).toBe(
      "/choose-username?next=%2F",
    );
  });
});

describe("role-aware landing and next", () => {
  const profile = {
    id: "u",
    display_name: null,
    email: null,
    status: "active" as const,
    avatar_url: null,
  };
  const mk = (over: Partial<MyContext>): MyContext => ({
    profile,
    platform_roles: [],
    memberships: [],
    ...over,
  });
  const cashier = mk({ memberships: [hall("h1", { permissions: ["invoice.view"] })] });

  it("lands an employee without device.view on the first page they can open", () => {
    expect(resolveLanding(cashier)).toBe("/halls/h1/invoices");
    expect(resolveLanding(mk({ memberships: [hall("h1", { permissions: [] })] }))).toBe(
      "/halls/h1/my-activity",
    );
  });
  it("drops a next target the account cannot open", () => {
    expect(postLoginDestination(cashier, "/admin")).toBe("/halls/h1/invoices");
    expect(postLoginDestination(cashier, "/halls/other/devices")).toBe("/halls/h1/invoices");
    expect(postLoginDestination(cashier, "/halls/h1/settings")).toBe("/halls/h1/invoices");
    expect(postLoginDestination(cashier, "/halls/h1/invoices?x=1")).toBe("/halls/h1/invoices?x=1");
    expect(postLoginDestination(mk({ platform_roles: ["sales_agent"] }), "/sales/agents")).toBe(
      "/sales",
    );
    expect(postLoginDestination(mk({ platform_roles: ["super_admin"] }), "/halls/h1")).toBe(
      "/admin",
    );
  });
  it("keeps players on public pages", () => {
    expect(postLoginDestination(mk({}), "/admin")).toBe("/");
    expect(postLoginDestination(mk({}), "/book/h/d")).toBe("/book/h/d");
  });
});
