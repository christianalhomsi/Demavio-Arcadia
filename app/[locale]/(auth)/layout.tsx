import { Gamepad2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">

      {/* subtle noise texture overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      {/* single centered glow */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center" aria-hidden>
        <div className="w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.26 280) 0%, transparent 70%)" }} />
      </div>

      {/* top-left brand mark */}
      <div className="fixed top-6 left-8 flex items-center gap-2.5 z-20">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
          <Gamepad2 size={14} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <span className="text-sm font-bold tracking-tight">
          <span style={{ color: "oklch(0.65 0.22 280)" }}>Arc</span>
          <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
        </span>
      </div>

      {/* form */}
      <div className="relative z-10 w-full max-w-[380px]">
        {children}
      </div>

      {/* bottom hint */}
      <p className="fixed bottom-6 text-xs text-muted-foreground/40 z-10">
        © {new Date().getFullYear()} Arcadia. All rights reserved.
      </p>

    </main>
  );
}
