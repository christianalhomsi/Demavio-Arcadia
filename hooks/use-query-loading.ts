"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";

export function useQueryLoading() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  
  return isFetching > 0 || isMutating > 0;
}
