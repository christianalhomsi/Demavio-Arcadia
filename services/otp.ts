import { getAdminClient } from "@/lib/supabase/admin";
import { getAppEnv } from "@/lib/env";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret), "HKDF", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: enc.encode("arcadia-password-enc") as BufferSource },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPassword(password: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(password));
  // layout: [16 salt][12 iv][ciphertext]
  const combined = new Uint8Array(16 + 12 + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(new Uint8Array(encrypted), 28);
  return Buffer.from(combined).toString("base64");
}

export async function decryptPassword(encryptedB64: string, secret: string): Promise<string> {
  const combined = Buffer.from(encryptedB64, "base64");
  if (combined.byteLength < 29) throw new Error("Failed to decrypt password");
  const salt = combined.slice(0, 16);
  const iv   = combined.slice(16, 28);
  const data = combined.slice(28);
  try {
    const key = await deriveKey(secret, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return dec.decode(decrypted);
  } catch {
    throw new Error("Failed to decrypt password");
  }
}

const MAX_ATTEMPTS = 5;

export async function storeOtpRequest(email: string, hash: string, password?: string, username?: string): Promise<void> {
  const supabase = getAdminClient();

  // Encrypt the password before storing — never store plaintext credentials
  let encryptedPassword: string | undefined;
  if (password) {
    const appEnv = getAppEnv();
    encryptedPassword = await encryptPassword(password, appEnv.otpSecret);
  }

  const { error } = await supabase.from("otp_requests").insert({
    email,
    otp_hash: hash,
    password_hash: encryptedPassword,
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
