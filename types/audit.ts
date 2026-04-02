export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "open"
  | "close"
  | "check_in"
  | "check_out"
  | "verify";

export type AuditLogEntry = {
  id: string;
  user_id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export type WriteAuditLogInput = {
  user_id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
};
