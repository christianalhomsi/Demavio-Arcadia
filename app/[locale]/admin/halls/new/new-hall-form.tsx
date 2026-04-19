"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Monitor, Hash, UserCog, UserPlus, Trash2, Plus, Clock } from "lucide-react";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import type { WorkingHours } from "@/types/hall";
import { useTranslations } from "next-intl";

function Section({ icon: Icon, title, desc, children, accent = "oklch(0.55 0.26 280)" }: {
  icon: React.ElementType; title: string; desc?: string;
  children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
        style={{ background: `${accent}08` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function NewHallForm() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, setPending]           = useState(false);
  const [name, setName]                 = useState("");
  const [address, setAddress]           = useState("");
  const [deviceCount, setDeviceCount]   = useState("4");
  const [prefix, setPrefix]             = useState("Station");
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
      const device_count = Number(deviceCount);
      if (!Number.isFinite(device_count) || device_count < 1) {
        toast.error("Device count must be at least 1."); setPending(false); return;
      }
      if (staffPassword.length < 6) {
        toast.error("Manager password must be at least 6 characters."); setPending(false); return;
      }
      for (const s of extraStaff.filter(s => s.email.trim())) {
        if (s.password.length < 6) {
          toast.error(`Password for ${s.email} must be at least 6 characters.`); setPending(false); return;
        }
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || null,
        device_count,
        device_name_prefix: prefix.trim() || "Station",
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
    <form onSubmit={onSubmit} className="space-y-5 max-w-2xl">

      {/* Hall info */}
      <Section icon={Building2} title={t('hallInformation')} desc={t('hallInfoDesc')}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('hallName')} id="name">
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="name" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Downtown Arena" required autoComplete="off" className="pl-9" />
            </div>
          </Field>
          <Field label={t('addressOptional')} id="address">
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="address" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St" autoComplete="off" className="pl-9" />
            </div>
          </Field>
        </div>
      </Section>

      {/* Devices */}
      <Section icon={Monitor} title={t('devices')} desc={t('devicesDesc')}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('numberOfDevices')} id="device_count">
            <div className="relative">
              <Monitor size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="device_count" type="number" min={1} max={500}
                value={deviceCount} onChange={e => setDeviceCount(e.target.value)}
                required className="pl-9" />
            </div>
          </Field>
          <Field label={t('deviceNamePrefix')} id="prefix">
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="prefix" value={prefix} onChange={e => setPrefix(e.target.value)}
                placeholder="Station" className="pl-9" />
            </div>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('devicesWillBeNamed')} <span className="font-mono text-foreground">{prefix || "Station"} 1</span>, <span className="font-mono text-foreground">{prefix || "Station"} 2</span>…
        </p>
      </Section>

      {/* Working Hours */}
      <Section icon={Clock} title={t('workingHours')} desc={t('workingHoursDesc')} accent="oklch(0.65 0.20 140)">
        <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
      </Section>

      {/* Manager */}
      <Section icon={UserCog} title={t('hallManager')} desc={t('hallManagerDesc')} accent="oklch(0.82 0.14 200)">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('email')} id="staff_email">
            <Input id="staff_email" type="email" value={staffEmail}
              onChange={e => setStaffEmail(e.target.value)}
              placeholder="manager@example.com" required autoComplete="off" />
          </Field>
          <Field label={t('password')} id="staff_password">
            <Input id="staff_password" type="password" value={staffPassword}
              onChange={e => setStaffPassword(e.target.value)}
              placeholder={t('minCharacters')} required autoComplete="new-password" />
          </Field>
        </div>
      </Section>

      {/* Extra staff */}
      <Section icon={UserPlus} title={t('staffAccounts')} desc={t('staffAccountsDesc')}>
        {extraStaff.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noExtraStaff')}</p>
        ) : (
          <div className="space-y-3">
            {extraStaff.map((s, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl border border-border/40 bg-muted/20 relative">
                <p className="absolute -top-2.5 left-3 text-xs font-medium px-1.5 bg-card text-muted-foreground">
                  {t('staff')} {i + 1}
                </p>
                <Input type="email" placeholder="staff@example.com" value={s.email}
                  onChange={e => setExtraStaff(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                  autoComplete="off" />
                <div className="flex gap-2">
                  <Input type="password" placeholder={t('minCharacters')} value={s.password}
                    onChange={e => setExtraStaff(prev => prev.map((x, j) => j === i ? { ...x, password: e.target.value } : x))}
                    autoComplete="new-password" className="flex-1" />
                  <button type="button"
                    onClick={() => setExtraStaff(prev => prev.filter((_, j) => j !== i))}
                    className="w-9 h-9 rounded-lg flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button"
          onClick={() => setExtraStaff(prev => [...prev, { email: "", password: "" }])}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-border px-3 py-2 rounded-lg transition-colors w-full justify-center">
          <Plus size={13} />
          {t('addStaffMember')}
        </button>
      </Section>

      {/* submit */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}
          className="gap-2 font-semibold"
          style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
          {pending ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Building2 size={15} />
          )}
          {pending ? t('creating') : t('createHall')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
