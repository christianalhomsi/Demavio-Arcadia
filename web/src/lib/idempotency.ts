/** One key per user intent; reuse it for retries, regenerate only after confirmed success. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
