"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Hall } from "@/types/hall";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type ListedUser = { id: string; email: string | undefined; created_at: string };

export default function AdminUsersClient({ halls }: { halls: Hall[] }) {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignHallId, setAssignHallId] = useState(halls[0]?.id ?? "");
  const [assignRole, setAssignRole] = useState<"staff" | "manager">("staff");
  const [assignPending, setAssignPending] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?page=1&perPage=50");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load users");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      toast.error("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setInvitePending(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Invite failed");
        return;
      }
      toast.success("Invitation sent.");
      setInviteEmail("");
      void loadUsers();
    } catch {
      toast.error("Invite failed");
    } finally {
      setInvitePending(false);
    }
  }

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignHallId) {
      toast.error("Select a hall.");
      return;
    }
    setAssignPending(true);
    try {
      const res = await fetch("/api/admin/staff-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: assignEmail.trim(),
          hall_id: assignHallId,
          role: assignRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Assignment failed");
        return;
      }
      toast.success("Staff assignment created.");
      setAssignEmail("");
    } catch {
      toast.error("Assignment failed");
    } finally {
      setAssignPending(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Invite by email
          </h2>
          <form onSubmit={onInvite} className="space-y-3 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="invite_email">Email</Label>
              <Input
                id="invite_email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={invitePending}>
              {invitePending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Assign user to hall
          </h2>
          <form onSubmit={onAssign} className="space-y-3 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="assign_email">User email</Label>
              <Input
                id="assign_email"
                type="email"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign_hall">Hall</Label>
              <select
                id="assign_hall"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={assignHallId}
                onChange={(e) => setAssignHallId(e.target.value)}
                required
              >
                {halls.length === 0 ? (
                  <option value="">No halls</option>
                ) : (
                  halls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign_role">Role</Label>
              <select
                id="assign_role"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                value={assignRole}
                onChange={(e) =>
                  setAssignRole(e.target.value as "staff" | "manager")
                }
              >
                <option value="staff">staff</option>
                <option value="manager">manager</option>
              </select>
            </div>
            <Button type="submit" disabled={assignPending || !halls.length}>
              {assignPending ? "Saving…" : "Assign"}
            </Button>
          </form>
        </div>
      </div>

      <Separator className="opacity-40" />

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Recent users (first page)
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users returned.</p>
        ) : (
          <ul className="rounded-lg border border-border/60 divide-y divide-border/40 text-sm">
            {users.map((u) => (
              <li
                key={u.id}
                className="px-3 py-2 flex flex-wrap justify-between gap-2"
              >
                <span className="font-medium">{u.email ?? u.id}</span>
                <span className="text-xs text-muted-foreground">{u.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
