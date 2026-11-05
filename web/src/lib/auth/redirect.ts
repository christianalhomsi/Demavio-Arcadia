/**
 * Returns `next` only if it is a same-origin relative path; otherwise the fallback.
 * Prevents open redirects through the `?next=` parameter (SEC-002).
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // Must start with a single slash. Reject protocol-relative ("//evil"), backslash tricks,
  // absolute URLs and control characters.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const parsed = new URL(next, "http://localhost");
    if (parsed.origin !== "http://localhost") return fallback;
  } catch {
    return fallback;
  }
  return next;
}
