import { describe, expect, it } from "vitest";
import { validateSignIn, validateSignUp } from "./credentials";

const ok = {
  username: "Sam_9",
  email: "sam@example.com",
  password: "longenough",
  confirm: "longenough",
};

describe("validateSignUp", () => {
  it("accepts a complete form", () => expect(validateSignUp(ok)).toBeNull());
  it.each([
    [{ username: "S" }, "username"],
    [{ username: "Sa" }, "username"],
    [{ username: "has space" }, "username"],
    [{ username: "x".repeat(21) }, "username"],
    [{ username: "سام_سام" }, "username"],
    [{ email: "nope" }, "email"],
    [{ password: "short", confirm: "short" }, "password"],
    [{ confirm: "different1" }, "confirm"],
  ])("flags %j", (over, field) => {
    expect(validateSignUp({ ...ok, ...over })?.field).toBe(field);
  });
});

describe("validateSignIn", () => {
  it("requires an email and a password", () => {
    expect(validateSignIn("x", "y")?.field).toBe("email");
    expect(validateSignIn("a@b.co", "")?.field).toBe("password");
    expect(validateSignIn("a@b.co", "pw")).toBeNull();
  });
});
