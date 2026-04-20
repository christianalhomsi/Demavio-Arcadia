"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Monitor, UserCog, UserPlus, Trash2, Plus, Clock } from "lucide-react";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import DeviceTypeSelector from "@/components/ui/device-type-selector";
import type { WorkingHours } from "@/types/hall";
import type { DeviceType } from "@/types/device-type";
import { useTranslations } from "next-intl";

function Section({ icon: Icon, title, desc, children, accent = "oklch(0.55 0.26 280)" }: {
  icon: React.ElementType; title: string; desc?: string;
  children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border/40"
        style={{ background: `linear-gradient(135deg, ${accent} / 0.08 0%, ${accent} / 0.03 100%)` }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent} / 0.15`, border: `1px solid ${accent} / 0.25` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div>
          <p className="text-base font-bold text-foreground">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function NewHallForm({ deviceTypes, locale }: { deviceTypes: DeviceType[]; locale: string }) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, setPending]           = useState(false);
  const [name, setName]                 = useState("");
  const [address, setAddress]           = useState("");
  const [devices, setDevices]           = useState<{ device_type_id: string; quantity: number; price_per_hour: number }[]>([]);
  const [staffEmail, setStaffEmail]     = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [extraStaff, setExtraStaff]     = useState<{ email: string; password: string }[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>([
    { day: 0, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 1, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 2, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 3, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 4, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 5, open_time: "09:00", close_time: "23:00", is_open: true },
    { day: 6, open_time: "09:00", close_time: "23:00", is_open: true },
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      if (devices.length === 0) {
        toast.error(locale === "ar" ? "يجب إضافة نوع جهاز واحد على الأقل" : "At least one device type is required");
        setPending(false);
        return;
      }
      if (staffPassword.length < 6) {
        toast.error("Manager password must be at least 6 characters.");
        setPending(false);
        return;
      }
      for (const s of extraStaff.filter(s => s.email.trim())) {
        if (s.password.length < 6) {
          toast.error(`Password for ${s.email} must be at least 6 characters.`);
          setPending(false);
          return;
        }
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || null,
        devices,
        working_hours: workingHours,
        staff: { email: staffEmail.trim(), password: staffPassword, role: "hall_manager" },
      };

      const filledExtra = extraStaff.filter(s => s.email.trim());
      if (filledExtra.length > 0) {
        body.extra_staff = filledExtra.map(s => ({ email: s.email.trim(), password: s.password }));
      }

      const res = await fetch("/api/admin/halls/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : "Could not create hall."); setPending(false); return; }

      toast.success("Hall created successfully!");
      router.push("/admin/halls");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="min-h-[calc(100vh-12rem)] pb-8">

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column */}
        <div className="space-y-6">
          {/* Hall info */}
          <Section icon={Building2} title={t('hallInformation')} desc={t('hallInfoDesc')}>
            <div className="space-y-5">
              <Field label={t('hallName')} id="name">
                <Input id="name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Downtown Arena" required autoComplete="off" className="h-11 text-base" />
              </Field>
              <Field label={t('addressOptional')} id="address">
                <Input id="address" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="123 Main St" autoComplete="off" className="h-11 text-base" />
              </Field>
            </div>
          </Section>

          {/* Working Hours */}
          <Section icon={Clock} title={t('workingHours')} desc={t('workingHoursDesc')} accent="oklch(0.65 0.20 140)">
            <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
          </Section>

          {/* Manager */}
          <Section icon={UserCog} title={t('hallManager')} desc={t('hallManagerDesc')} accent="oklch(0.82 0.14 200)">
            <div className="space-y-5">
              <Field label={t('email')} id="staff_email">
                <Input id="staff_email" type="email" value={staffEmail}
                  onChange={e => setStaffEmail(e.target.value)}
                  placeholder="manager@example.com" required autoComplete="off" className="h-11 text-base" />
              </Field>
              <Field label={t('password')} id="staff_password">
                <Input id="staff_password" type="password" value={staffPassword}
                  onChange={e => setStaffPassword(e.target.value)}
                  placeholder={t('minCharacters')} required autoComplete="new-password" className="h-11 text-base" />
              </Field>
            </div>
          </Section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Devices */}
          <Section icon={Monitor} title={t('devices')} desc={locale === "ar" ? "اختر أنواع الأجهزة والكمية لكل نوع" : "Select device types and quantity for each"}>
            <DeviceTypeSelector
              deviceTypes={deviceTypes}
              value={devices}
              onChange={setDevices}
              locale={locale}
            />
          </Section>

          {/* Extra staff */}
          <Section icon={UserPlus} title={t('staffAccounts')} desc={t('staffAccountsDesc')}>
            {extraStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t('noExtraStaff')}</p>
            ) : (
              <div className="space-y-3">
                {extraStaff.map((s, i) => (
                  <div key={i} className="space-y-3 p-4 rounded-xl border border-border/40 bg-muted/20 relative">
                    <p className="absolute -top-2.5 left-3 text-xs font-medium px-1.5 bg-card text-muted-foreground">
                      {t('staff')} {i + 1}
                    </p>
                    <Input type="email" placeholder="staff@example.com" value={s.email}
                      onChange={e => setExtraStaff(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                      autoComplete="off" className="h-11" />
                    <div className="flex gap-2">
                      <Input type="password" placeholder={t('minCharacters')} value={s.password}
                        onChange={e => setExtraStaff(prev => prev.map((x, j) => j === i ? { ...x, password: e.target.value } : x))}
                        autoComplete="new-password" className="flex-1 h-11" />
                      <button type="button"
                        onClick={() => setExtraStaff(prev => prev.filter((_, j) => j !== i))}
                        className="w-11 h-11 rounded-lg flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button"
              onClick={() => setExtraStaff(prev => [...prev, { email: "", password: "" }])}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-border px-4 py-3 rounded-lg transition-colors w-full justify-center">
              <Plus size={16} />
              {t('addStaffMember')}
            </button>
          </Section>
        </div>
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border/50 py-4 mt-8">
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-11 px-6">
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={pending}
            className="gap-2 font-semibold h-11 px-8"
            style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
            {pending ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Building2 size={16} />
            )}
            {pending ? t('creating') : t('createHall')}
          </Button>
        </div>
      </div>
    </form>
  );
}
