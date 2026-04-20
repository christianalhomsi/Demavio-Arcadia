"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Gamepad2 } from "lucide-react";

export function NavigationLoader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      {isNavigating && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            {/* Logo with pulse animation */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl animate-pulse"
                style={{ 
                  background: "oklch(0.55 0.26 280 / 0.2)",
                  filter: "blur(12px)"
                }} />
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ 
                  background: "oklch(0.55 0.26 280 / 0.15)",
                  border: "1px solid oklch(0.55 0.26 280 / 0.3)"
                }}>
                <Gamepad2 size={28} style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
            </div>
            
            {/* Loading bar */}
            <div className="w-48 h-1 rounded-full overflow-hidden bg-muted">
              <div className="h-full animate-[loading_1s_ease-in-out_infinite] rounded-full" 
                style={{ 
                  background: "linear-gradient(90deg, oklch(0.55 0.26 280), oklch(0.82 0.14 200))",
                  width: "40%",
                  boxShadow: "0 0 10px oklch(0.55 0.26 280 / 0.5)"
                }} />
            </div>
            
            {/* Loading text */}
            <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
