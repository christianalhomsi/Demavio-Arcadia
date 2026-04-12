export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 60% 0%, #1a1040 0%, #0d0f14 60%)" }}>
      {/* decorative glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #6c63ff 0%, transparent 70%)" }} />
      </div>
      <div className="relative z-10 w-full max-w-sm">
        {/* logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-primary)" }}>
            Gaming<span style={{ color: "var(--color-accent)" }}>Hub</span>
          </span>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Staff & Player Portal
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
