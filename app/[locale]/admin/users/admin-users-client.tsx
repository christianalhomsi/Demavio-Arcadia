"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Hall } from "@/types/hall";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Mail, Send, UserCheck, Building2, ShieldCheck, User, RefreshCw, UserPlus, Search } from "lucide-react";

type ListedUser = { id: string; email: string | undefined; created_at: string; role: string };

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
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function AdminUsersClient({ halls }: { halls: Hall[] }) {
  const [users, setUsers]               = useState<ListedUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [inviteEmail, setInviteEmail]       = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePending, setInvitePending]   = useState(false);
  const [assignEmail, setAssignEmail]   = useState("");
  const [assignHallId, setAssignHallId] = useState(halls[0]?.id ?? "");
  const [assignRole, setAssignRole]     = useState<"staff" | "manager">("staff");
  const [assignPending, setAssignPending] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?page=1&perPage=50");
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to load users"); setUsers([]); return; }
      setUsers(data.users ?? []);
    } catch {
      toast.error("Failed to load users"); setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setInvitePending(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), password: invitePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : "Failed to create user"); return; }
      toast.success("User created successfully.");
      setInviteEmail("");
      setInvitePassword("");
      void loadUsers();
    } catch {
      toast.error("Invite failed");
    } finally {
      setInvitePending(false);
    }
  }

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignHallId) { toast.error("Select a hall."); return; }
    setAssignPending(true);
    try {
      const res = await fetch("/api/admin/staff-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: assignEmail.trim(), hall_id: assignHallId, role: assignRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : "Assignment failed"); return; }
      toast.success("Staff assignment created.");
      setAssignEmail("");
    } catch {
      toast.error("Assignment failed");
    } finally {
      setAssignPending(false);
    }
  }

  const selectCls = "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors";

  const filtered = search.trim()
    ? users.filter(u =>
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="space-y-5">

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Invite */}
        <Section icon={Mail} title="Create User" desc="Create a new player account">
          <form onSubmit={onInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite_email" className="text-xs font-medium text-muted-foreground">Email address</Label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <Input id="invite_email" type="email" value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@example.com" required className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite_password" className="text-xs font-medium text-muted-foreground">Password</Label>
              <Input id="invite_password" type="password" value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                placeholder="Min 6 characters" required autoComplete="new-password" />
            </div>
            <Button type="submit" disabled={invitePending} className="gap-2 w-full font-semibold"
              style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
              {invitePending
                ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                : <UserPlus size={14} />}
              {invitePending ? "Creating…" : "Create User"}
            </Button>
          </form>
        </Section>

        {/* Assign */}
        <Section icon={UserCheck} title="Assign to Hall" desc="Grant a user access to a hall" accent="oklch(0.82 0.14 200)">
          <form onSubmit={onAssign} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assign_email" className="text-xs font-medium text-muted-foreground">User email</Label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <Input id="assign_email" type="email" value={assignEmail}
                  onChange={e => setAssignEmail(e.target.value)}
                  placeholder="user@example.com" required className="pl-9" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign_hall" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Building2 size={11} /> Hall
                </Label>
                <select id="assign_hall" className={selectCls} value={assignHallId}
                  onChange={e => setAssignHallId(e.target.value)} required>
                  {halls.length === 0
                    ? <option value="">No halls</option>
                    : halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign_role" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <ShieldCheck size={11} /> Role
                </Label>
                <select id="assign_role" className={selectCls} value={assignRole}
                  onChange={e => setAssignRole(e.target.value as "staff" | "manager")}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>

            <Button type="submit" disabled={assignPending || !halls.length} className="gap-2 w-full font-semibold"
              style={{ background: "oklch(0.82 0.14 200)", color: "oklch(0.13 0.010 265)" }}>
              {assignPending
                ? <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                : <UserCheck size={14} />}
              {assignPending ? "Saving…" : "Assign"}
            </Button>
          </form>
        </Section>
      </div>

      {/* Users list */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <User size={15} className="text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">All Users</p>
            {!loading && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {filtered.length}{search ? ` of ${users.length}` : ""}
              </span>
            )}
          </div>
          <button onClick={() => void loadUsers()}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* search */}
        <div className="px-5 py-3 border-b border-border/30">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by email or role…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-border/30">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 bg-muted rounded animate-pulse" />
                  <div className="h-2.5 w-64 bg-muted/60 rounded animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? `No users matching "${search}"` : "No users found."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((u) => (
              <div key={u.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                  style={{ background: "oklch(0.55 0.26 280 / 0.12)", color: "oklch(0.65 0.22 280)" }}>
                  {(u.email ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{u.id}</p>
                </div>
                <RoleBadge role={u.role} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_STYLE: Record<string, { label: string; cls: string }> = {
  super_admin:  { label: "Super Admin",  cls: "bg-violet-500/15 text-violet-400 border border-violet-500/25" },
  hall_manager: { label: "Manager",      cls: "bg-blue-500/15 text-blue-400 border border-blue-500/25" },
  hall_staff:   { label: "Staff",        cls: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" },
  player:       { label: "Player",       cls: "bg-green-500/15 text-green-400 border border-green-500/25" },
};

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? { label: role, cls: "bg-muted text-muted-foreground border border-border/50" };
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  );
}
