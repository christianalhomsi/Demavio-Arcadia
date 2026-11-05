import type { Messages } from "@/lib/i18n/messages";

export type CredentialIssue = {
  field: "username" | "email" | "password" | "confirm";
  message: keyof Messages;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
/** 3 to 20 letters, digits or underscore. The database stores it in lowercase and keeps it unique. */
export const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

/** UX validation only; Supabase Auth enforces its own rules and is the authority. */
export function validateSignIn(email: string, password: string): CredentialIssue | null {
  if (!EMAIL.test(email.trim())) return { field: "email", message: "errEmail" };
  if (password.length === 0) return { field: "password", message: "errInvalidCreds" };
  return null;
}

export function validateSignUp(v: {
  username: string;
  email: string;
  password: string;
  confirm: string;
}): CredentialIssue | null {
  if (!USERNAME.test(v.username.trim())) return { field: "username", message: "errUsername" };
  if (!EMAIL.test(v.email.trim())) return { field: "email", message: "errEmail" };
  if (v.password.length < MIN_PASSWORD) return { field: "password", message: "errPasswordShort" };
  if (v.password !== v.confirm) return { field: "confirm", message: "errPasswordMismatch" };
  return null;
}
