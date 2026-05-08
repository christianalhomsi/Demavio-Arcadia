"use client";

import { useState } from "react";
import { Users, Clock, DollarSign } from "lucide-react";
import StaffSection from "./staff-section";
import WorkingHoursSection from "./working-hours-section";
import ComprehensivePricingSection from "./comprehensive-pricing-section";

type Props = {
  hallId: string;
  locale: string;
  isManager: boolean;
  deviceTypes: Array<{ id: string; name_ar: string; name_en: string }>;
  defaultPricing: Array<{ device_type_id: string; price_per_hour: number }>;
  workingHours: Array<any>;
  staff: Array<{ user_id: string; role: string; email: string; username: string }>;
};

export default function SettingsContent({
  hallId,
  locale,
  isManager,
  deviceTypes,
  defaultPricing,
  workingHours,
  staff,
}: Props) {
  const [activeSection, setActiveSection] = useState("staff");

  const sections = [
    ...(isManager ? [{ id: "staff", label: locale === "ar" ? "الموظفين" : "Staff", icon: Users }] : []),
    { id: "hours", label: locale === "ar" ? "ساعات العمل" : "Working Hours", icon: Clock },
    { id: "pricing", label: locale === "ar" ? "الأسعار" : "Pricing", icon: DollarSign },
  ];

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="w-64 shrink-0">
        <div className="sticky top-6 space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "text-white shadow-lg"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                style={
                  isActive
                    ? {
                        background: "oklch(0.55 0.26 280)",
                        boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)",
                      }
                    : {}
                }
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-8">
        {isManager && activeSection === "staff" && (
          <StaffSection hallId={hallId} staff={staff} isManager={isManager} locale={locale} />
        )}
        {activeSection === "hours" && (
          <WorkingHoursSection hallId={hallId} initialHours={workingHours} locale={locale} />
        )}
        {activeSection === "pricing" && (
          <ComprehensivePricingSection
            hallId={hallId}
            locale={locale}
            deviceTypes={deviceTypes}
            defaultPricing={defaultPricing}
          />
        )}
      </div>
    </div>
  );
}
