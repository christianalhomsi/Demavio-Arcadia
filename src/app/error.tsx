"use client";

import { ErrorState } from "@/components/data/ErrorState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only the opaque digest is shown; error details stay in server logs (spec §21.2).
  return (
    <div className="mx-auto max-w-md py-16">
      <ErrorState reference={error.digest} onRetry={reset} />
    </div>
  );
}
