// Email sign-up with a 6-digit code: the auth user is created only after the code is confirmed.
// Secrets: SMTP_USER, SMTP_PASSWORD (Gmail App Password), OTP_SECRET. Every answer is HTTP 200 with
// { status }, so the client reads one shape and internals never reach the browser.
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_]{3,20}$/;

const reply = (status: string) =>
  new Response(JSON.stringify({ status }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

/** Bound to the email, so the same code for two people never gives the same hash. */
async function hashCode(email: string, code: string): Promise<string> {
  const data = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    data.encode(env("OTP_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data.encode(`${email}:${code}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCode(): string {
  // Rejection sampling keeps all 6-digit codes equally likely.
  const limit = 4_294_000_000;
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n);
  while (n[0] >= limit);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

async function sendCode(email: string, code: string) {
  const user = env("SMTP_USER");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: env("SMTP_PASSWORD") },
  });
  await transport.sendMail({
    from: `"Arcadia" <${user}>`,
    to: email,
    subject: "رمز التحقق من Arcadia",
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;text-align:center">
      <h2>مرحباً بك في Arcadia</h2>
      <p>رمز التحقق الخاص بك:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
      <p>ينتهي الرمز خلال 10 دقائق. إذا لم تطلبه فتجاهل هذه الرسالة.</p>
    </div>`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply("invalid");

  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return reply("invalid");

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    if (body?.action === "request") {
      const username = String(body?.username ?? "").trim().toLowerCase();
      if (!USERNAME.test(username)) return reply("invalid");
      const free = await admin.rpc("username_available", { p_username: username });
      if (free.error) throw free.error;
      if (free.data === false) return reply("username_taken");

      // An already-registered email gets the same answer, without a mail: never reveal accounts.
      const taken = await admin.from("profiles").select("id").ilike("email", email).limit(1);
      if (taken.error) throw taken.error;
      if (taken.data.length > 0) return reply("ok");

      const code = generateCode();
      const begun = await admin.rpc("pending_signup_begin", {
        p_email: email,
        p_username: username,
        p_hash: await hashCode(email, code),
      });
      if (begun.error) throw begun.error;
      if (begun.data !== "ok") return reply("wait");
      await sendCode(email, code);
      return reply("ok");
    }

    if (body?.action === "verify") {
      const code = String(body?.code ?? "");
      const password = String(body?.password ?? "");
      if (!/^\d{6}$/.test(code) || password.length < 8) return reply("invalid_code");

      const claimed = await admin.rpc("pending_signup_claim", {
        p_email: email,
        p_hash: await hashCode(email, code),
      });
      if (claimed.error) throw claimed.error;
      if (!claimed.data) return reply("invalid_code");

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: claimed.data, username: claimed.data },
      });
      if (created.error) {
        // The code stays usable, so a passing failure does not cost the user their code.
        await admin.from("pending_signups").update({ claimed_until: null }).eq("email", email);
        console.error("createUser failed", created.error.code);
        return reply("failed");
      }
      await admin.from("pending_signups").delete().eq("email", email);
      return reply("ok");
    }

    return reply("invalid");
  } catch (err) {
    console.error("signup-otp failed", err instanceof Error ? err.message : "unknown");
    return reply("failed");
  }
});
