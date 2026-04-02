import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OTP_SECRET: z.string().min(32),
  EMAIL_PROVIDER_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  AGENT_SERVER_URL: z.string().url(),
  AGENT_SERVER_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.errors
    .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
    .join("\n");
  throw new Error(`Missing or invalid environment variables:\n${missing}`);
}

export const env = parsed.data;

// Grouped helpers for convenience
export const supabaseEnv = {
  url: env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

export const emailEnv = {
  apiKey: env.EMAIL_PROVIDER_API_KEY,
  from: env.EMAIL_FROM,
} as const;

export const agentEnv = {
  url: env.AGENT_SERVER_URL,
  secret: env.AGENT_SERVER_SECRET,
} as const;
