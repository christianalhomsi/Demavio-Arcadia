import { QueryClient } from "@tanstack/react-query";

const BROWSER_STALE_TIME = 60 * 1000;

export function makeServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
      },
    },
  });
}

export function makeBrowserQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: BROWSER_STALE_TIME,
        refetchOnWindowFocus: false,
      },
    },
  });
}
