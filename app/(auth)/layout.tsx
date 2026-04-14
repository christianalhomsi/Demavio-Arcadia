export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.26 280) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.14 200) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* brand */}
        <div className="text-center mb-8 space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 glow-primary"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
            <span className="text-2xl">🎮</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Gaming</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>Hub</span>
          </h1>
          <p className="text-sm text-muted-foreground">Staff & Player Portal</p>
        </div>
        {children}
      </div>
    </main>
  );
}
