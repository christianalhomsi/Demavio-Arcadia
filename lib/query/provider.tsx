"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRef } from "react";
import { makeBrowserQueryClient } from "./client";
import type { QueryClient } from "@tanstack/react-query";

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientRef = useRef<QueryClient | null>(null);
  if (!clientRef.current) clientRef.current = makeBrowserQueryClient();

  return (
    <QueryClientProvider client={clientRef.current}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
