export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "STALE_STATE",
  "DUPLICATE",
  "INSUFFICIENT_FUNDS",
  "PRECONDITION_FAILED",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> => ({ ok: false, code, message, fieldErrors });
