const REDACT = /token|secret|password|authorization|cookie|apikey|api_key|email|card/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        REDACT.test(k) ? "[REDACTED]" : redact(v),
      ]),
    );
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

export function log(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(redact(fields) as object),
  });
  (level === "error" ? console.error : console.log)(line);
}
