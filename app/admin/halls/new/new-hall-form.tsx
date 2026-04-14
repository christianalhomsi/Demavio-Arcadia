"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function NewHallForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [deviceCount, setDeviceCount] = useState("4");
  const [prefix, setPrefix] = useState("Station");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [extraStaff, setExtraStaff] = useState<{ email: string; password: string }[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const device_count = Number(deviceCount);
      if (!Number.isFinite(device_count) || device_count < 1) {
        toast.error("Device count must be at least 1.");
        setPending(false);
        return;
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || null,
        device_count,
        device_name_prefix: prefix.trim() || "Station",
      };

      const email = staffEmail.trim();
      if (staffPassword.length < 6) {
        toast.error("Password must be at least 6 characters.");
        setPending(false);
        return;
      }
      body.staff = { email, password: staffPassword, role: "hall_manager" };

      const filledExtra = extraStaff.filter((s) => s.email.trim());
      for (const s of filledExtra) {
        if (s.password.length < 6) {
          toast.error(`Password for ${s.email} must be at least 6 characters.`);
          setPending(false);
          return;
        }
      }
      if (filledExtra.length > 0) {
        body.extra_staff = filledExtra.map((s) => ({ email: s.email.trim(), password: s.password }));
      }

      const res = await fetch("/api/admin/halls/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string"
            ? data.error
            : "Could not create hall."
        );
        setPending(false);
        return;
      }

      toast.success("Hall created.");
      router.push("/admin/halls");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="name">Hall name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address (optional)</Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="device_count">Number of devices</Label>
        <Input
          id="device_count"
          type="number"
          min={1}
          max={500}
          value={deviceCount}
          onChange={(e) => setDeviceCount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="prefix">Device name prefix</Label>
        <Input
          id="prefix"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Station"
        />
      </div>

      <div className="rounded-xl border border-border/60 p-4 space-y-4 bg-card/40">
        <p className="text-sm font-medium text-foreground">Hall manager account</p>
        <div className="space-y-2">
          <Label htmlFor="staff_email">Email</Label>
          <Input
            id="staff_email"
            type="email"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
            autoComplete="off"
            placeholder="manager@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff_password">Password</Label>
          <Input
            id="staff_password"
            type="password"
            value={staffPassword}
            onChange={(e) => setStaffPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Min 6 characters"
            required
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 p-4 space-y-4 bg-card/40">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Staff accounts (optional)</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExtraStaff((prev) => [...prev, { email: "", password: "" }])}
          >
            + Add staff
          </Button>
        </div>
        {extraStaff.map((s, i) => (
          <div key={i} className="space-y-2 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Staff {i + 1}</span>
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => setExtraStaff((prev) => prev.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
            <Input
              type="email"
              placeholder="staff@example.com"
              value={s.email}
              onChange={(e) => setExtraStaff((prev) => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
              autoComplete="off"
            />
            <Input
              type="password"
              placeholder="Min 6 characters"
              value={s.password}
              onChange={(e) => setExtraStaff((prev) => prev.map((x, j) => j === i ? { ...x, password: e.target.value } : x))}
              autoComplete="new-password"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create hall"}
        </Button>
      </div>
    </form>
  );
}
