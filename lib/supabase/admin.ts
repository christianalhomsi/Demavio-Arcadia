import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

export function getAdminClient() {
  return createClient(supabaseEnv.url, supabaseEnv.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
