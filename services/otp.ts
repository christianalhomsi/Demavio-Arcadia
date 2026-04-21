import { getAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 5;

export async function storeOtpRequest(email: string, hash: string, password?: string, username?: string): Promise<void> {
  const supabase = getAdminClient();

  const { error } = await supabase.from("otp_requests").insert({
    email,
    otp_hash: hash,
    password_hash: password,
    username: username,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (error) throw new Error(error.message);
}

export type OtpRequest = {
  id: string;
  email: string;
  otp_hash: string;
  password_hash?: string | null;
  username?: string | null;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
};

export async function getLatestOtpRequest(email: string): Promise<OtpRequest | null> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("otp_requests")
    .select("id, email, otp_hash, password_hash, username, expires_at, attempts, verified_at")
    .eq("email", email)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function incrementOtpAttempts(id: string): Promise<void> {
  const supabase = getAdminClient();

  const { error } = await supabase.rpc("increment_otp_attempts", { row_id: id });

  if (error) throw new Error(error.message);
}

export async function markOtpVerified(id: string): Promise<void> {
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("otp_requests")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
