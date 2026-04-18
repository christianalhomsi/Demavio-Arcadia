"use client";

import { useQueryLoading } from "@/hooks";

export function QueryLoadingBar() {
  const isLoading = useQueryLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent">
      <div 
        className="h-full animate-[loading_1s_ease-in-out_infinite]" 
        style={{ 
          background: "oklch(0.55 0.26 280)",
          width: "40%",
          boxShadow: "0 0 10px oklch(0.55 0.26 280 / 0.5)"
        }} 
      />
    </div>
  );
}
