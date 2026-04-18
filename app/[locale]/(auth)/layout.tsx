import { Gamepad2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">

      {/* ambient glows */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-[0.12]"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.26 280) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.14 200) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.26 280) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-6">
        {/* brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mx-auto"
            style={{
              background: "oklch(0.55 0.26 280 / 0.15)",
              border: "1px solid oklch(0.55 0.26 280 / 0.3)",
              boxShadow: "0 0 30px oklch(0.55 0.26 280 / 0.2)",
            }}>
            <Gamepad2 size={26} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
              <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Staff & Player Portal</p>
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}
