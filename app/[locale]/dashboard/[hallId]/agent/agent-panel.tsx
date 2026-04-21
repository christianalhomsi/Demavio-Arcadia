"use client";

import { useState } from "react";
import type { AgentCommand } from "@/types/agent";
import type { Device } from "@/services/devices";

type CommandState = "idle" | "loading" | "success" | "error";
type CommandStatus = { state: CommandState; message?: string };

// Commands that require no args
const SIMPLE_COMMANDS: { command: AgentCommand; label: string; danger?: boolean }[] = [
  { command: "lock",       label: "Lock"       },
  { command: "unlock",     label: "Unlock"     },
  { command: "screenshot", label: "Screenshot" },
  { command: "restart",    label: "Restart",   danger: true },
  { command: "shutdown",   label: "Shutdown",  danger: true },
];

const STATUS_STYLE: Record<Device["status"], React.CSSProperties> = {
  available: { background: "#dcfce7", color: "#15803d" },
  active:    { background: "#dbeafe", color: "#1d4ed8" },
  offline:   { background: "#f3f4f6", color: "#6b7280" },
  idle:      { background: "#fef9c3", color: "#a16207" },
  paused:    { background: "#fed7aa", color: "#c2410c" },
};

const STATUS_LABEL: Record<Device["status"], string> = {
  available: "Available",
  active:    "Active",
  offline:   "Offline",
  idle:      "Reserved",
  paused:    "Paused",
};

export default function AgentPanel({
  devices,
  hallId,
}: {
  devices: Device[];
  hallId: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(devices[0]?.id ?? "");
  const [statuses, setStatuses]     = useState<Record<string, CommandStatus>>({});
  const [messageText, setMessageText] = useState("");
  const [msgStatus, setMsgStatus]   = useState<CommandStatus>({ state: "idle" });

  const selected = devices.find((d) => d.id === selectedId) ?? null;

  function setStatus(command: string, next: CommandStatus) {
    setStatuses((prev) => ({ ...prev, [command]: next }));
  }

  async function sendCommand(command: AgentCommand, args?: Record<string, unknown>) {
    if (!selected) return;
    const key = command;
    setStatus(key, { state: "loading" });

    const res = await fetch("/api/agent/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, device_id: selected.id, hall_id: hallId, args }),
    });

    if (res.ok) {
      setStatus(key, { state: "success" });
      setTimeout(() => setStatus(key, { state: "idle" }), 3000);
    } else {
      const json = await res.json().catch(() => ({}));
      const msg = typeof json?.error === "string"
        ? json.error
        : "Command failed.";
      setStatus(key, { state: "error", message: msg });
      setTimeout(() => setStatus(key, { state: "idle" }), 5000);
    }
  }

  async function sendMessage() {
    if (!messageText.trim() || !selected) return;
    setMsgStatus({ state: "loading" });

    const res = await fetch("/api/agent/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "message",
        device_id: selected.id,
        hall_id: hallId,
        args: { text: messageText.trim() },
      }),
    });

    if (res.ok) {
      setMsgStatus({ state: "success" });
      setMessageText("");
      setTimeout(() => setMsgStatus({ state: "idle" }), 3000);
    } else {
      const json = await res.json().catch(() => ({}));
      const msg = typeof json?.error === "string" ? json.error : "Failed to send message.";
      setMsgStatus({ state: "error", message: msg });
      setTimeout(() => setMsgStatus({ state: "idle" }), 5000);
    }
  }

  if (devices.length === 0) {
    return <p style={empty}>No devices found for this hall.</p>;
  }

  return (
    <div style={panel}>
      {/* ── device selector ── */}
      <div style={selectorWrap}>
        <label style={selectorLabel}>Device</label>
        <div style={deviceList}>
          {devices.map((d) => {
            const badge = STATUS_STYLE[d.status];
            const active = d.id === selectedId;
            return (
              <button
                key={d.id}
                onClick={() => { setSelectedId(d.id); setStatuses({}); setMsgStatus({ state: "idle" }); }}
                style={deviceBtn(active)}
              >
                <span style={deviceBtnName}>{d.name}</span>
                <span style={{ ...statusPill, ...badge }}>{STATUS_LABEL[d.status]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── command panel ── */}
      {selected && (
        <div style={commandSection}>
          <p style={sectionLabel}>
            Commands for <strong>{selected.name}</strong>
          </p>

          {/* simple commands */}
          <div style={commandGrid}>
            {SIMPLE_COMMANDS.map(({ command, label, danger }) => {
              const s = statuses[command] ?? { state: "idle" };
              return (
                <CommandButton
                  key={command}
                  label={label}
                  status={s}
                  danger={danger}
                  onClick={() => sendCommand(command)}
                />
              );
            })}
          </div>

          {/* message command */}
          <div style={messageWrap}>
            <p style={sectionLabel}>Send message</p>
            <div style={messageRow}>
              <input
                type="text"
                placeholder="Message to display on device…"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                style={messageInput}
                disabled={msgStatus.state === "loading"}
              />
              <button
                onClick={sendMessage}
                disabled={msgStatus.state === "loading" || !messageText.trim()}
                style={sendBtn(msgStatus.state === "loading" || !messageText.trim())}
              >
                {msgStatus.state === "loading" ? "Sending…" : "Send"}
              </button>
            </div>
            {msgStatus.state === "success" && (
              <p style={successText}>✓ Message sent</p>
            )}
            {msgStatus.state === "error" && (
              <p style={errorText}>{msgStatus.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── command button ───────────────────────────────────────────────────────────

function CommandButton({
  label,
  status,
  danger,
  onClick,
}: {
  label: string;
  status: CommandStatus;
  danger?: boolean;
  onClick: () => void;
}) {
  const isLoading = status.state === "loading";
  const isSuccess = status.state === "success";
  const isError   = status.state === "error";

  return (
    <div style={cmdWrap}>
      <button
        onClick={onClick}
        disabled={isLoading}
        style={cmdBtn(isLoading, !!danger, isSuccess, isError)}
      >
        {isLoading ? "…" : isSuccess ? `✓ ${label}` : label}
      </button>
      {isError && <p style={errorText}>{status.message}</p>}
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.75rem",
};

const selectorWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const selectorLabel: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const deviceList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const deviceBtn = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem 0.875rem",
  borderRadius: "0.5rem",
  border: active ? "2px solid #111827" : "1px solid #e5e7eb",
  background: active ? "#f9fafb" : "#fff",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: active ? 600 : 400,
  color: "#111827",
});

const deviceBtnName: React.CSSProperties = {
  whiteSpace: "nowrap",
};

const statusPill: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 500,
  padding: "0.15rem 0.5rem",
  borderRadius: "9999px",
};

const commandSection: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};

const sectionLabel: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#374151",
};

const commandGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.625rem",
};

const cmdWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const cmdBtn = (
  disabled: boolean,
  danger: boolean,
  success: boolean,
  error: boolean
): React.CSSProperties => ({
  padding: "0.5rem 1.125rem",
  borderRadius: "0.375rem",
  border: danger ? "1px solid #fca5a5" : "1px solid #e5e7eb",
  background: success ? "#dcfce7" : error ? "#fee2e2" : disabled ? "#f3f4f6" : "#fff",
  color: success ? "#15803d" : error ? "#b91c1c" : danger ? "#b91c1c" : "#111827",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "background 0.15s",
  minWidth: "90px",
});

const messageWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  paddingTop: "1rem",
  borderTop: "1px solid #f3f4f6",
};

const messageRow: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
};

const messageInput: React.CSSProperties = {
  flex: 1,
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.875rem",
  outline: "none",
};

const sendBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
});

const successText: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#15803d",
};

const errorText: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#ef4444",
};

const empty: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#6b7280",
};
