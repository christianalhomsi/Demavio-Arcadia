import { describe, expect, it } from "vitest";
import { DETAIL_MESSAGES, ERROR_MESSAGES } from "./errors";
import { DETAIL_MESSAGES_AR, ERROR_MESSAGES_AR } from "./errorsAr";
import { localizeResult, localizeText } from "./localize";
import { fail } from "./result";

describe("localizeText", () => {
  it("translates every known message and leaves unknown text alone", () => {
    expect(localizeText(ERROR_MESSAGES.FORBIDDEN)).toBe(ERROR_MESSAGES_AR.FORBIDDEN);
    expect(localizeText(DETAIL_MESSAGES.past_deadline!)).toBe(DETAIL_MESSAGES_AR.past_deadline);
    expect(localizeText("Something only the page knows")).toBe("Something only the page knows");
  });
  it("has an Arabic message for every English one, never empty or identical", () => {
    for (const [k, en] of Object.entries(ERROR_MESSAGES)) {
      const ar = ERROR_MESSAGES_AR[k as keyof typeof ERROR_MESSAGES_AR];
      expect(ar.length).toBeGreaterThan(0);
      expect(ar).not.toBe(en);
    }
    for (const [k, en] of Object.entries(DETAIL_MESSAGES)) {
      const ar = DETAIL_MESSAGES_AR[k as keyof typeof DETAIL_MESSAGES_AR];
      expect(ar.length).toBeGreaterThan(0);
      expect(ar).not.toBe(en);
    }
  });
});

describe("localizeResult", () => {
  it("keeps English (and the exact object) outside a request, and passes successes through", async () => {
    const failed = fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN, { name: "x" });
    expect(await localizeResult(failed)).toBe(failed);
    const ok = { ok: true as const, data: 1 };
    expect(await localizeResult(ok)).toBe(ok);
  });
});
