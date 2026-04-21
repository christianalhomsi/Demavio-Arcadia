"use client";

import { useState } from "react";
import DashboardHeader from "@/components/layout/dashboard-header";
import DashboardSidebar from "@/components/layout/dashboard-sidebar";

export default function DashboardLayoutClient({
  children,
  hallName,
  hallId,
}: {
  children: React.ReactNode;
  hallName: string;
  hallId: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <DashboardHeader 
        hallName={hallName} 
        hallId={hallId} 
        onMenuClick={() => setMobileMenuOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 border-r border-border/60 overflow-y-auto bg-card/50 hidden md:block">
          <DashboardSidebar 
            hallId={hallId} 
            mobileMenuOpen={false}
            setMobileMenuOpen={setMobileMenuOpen}
          />
        </aside>
        <div className="md:hidden">
          <DashboardSidebar 
            hallId={hallId} 
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
