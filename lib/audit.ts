import { getAdminClient } from "@/lib/supabase/admin";
import type { WriteAuditLogInput } from "@/types/audit";

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const supabase = getAdminClient();

  const { error } = await supabase.from("audit_logs").insert({
    user_id: input.user_id,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    old_data: input.old_data ?? null,
    new_data: input.new_data ?? null,
  });

  if (error) {
    console.error("[audit]", error.message, input);
  }
}
