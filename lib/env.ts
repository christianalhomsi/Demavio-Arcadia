import { z } from "zod";

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const appEnvSchema = z.object({
  OTP_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
});

const emailEnvSchema = z.object({
  EMAIL_PROVIDER_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
});

const agentEnvSchema = z.object({
  AGENT_SERVER_URL: z.string().url(),
  AGENT_SERVER_SECRET: z.string().min(32),
});

function parseEnv<T extends z.ZodTypeAny>(schema: T, context: string): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) {
    return parsed.data;
  }

  const missing = parsed.error.errors
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Missing or invalid ${context} environment variables:\n${missing}`);
}

let supabaseCache: z.infer<typeof supabaseEnvSchema> | null = null;
let appCache: z.infer<typeof appEnvSchema> | null = null;
let emailCache: z.infer<typeof emailEnvSchema> | null = null;
let agentCache: z.infer<typeof agentEnvSchema> | null = null;

export function getSupabaseEnv() {
  if (!supabaseCache) {
    supabaseCache = parseEnv(supabaseEnvSchema, "Supabase");
  }

  return {
    url: supabaseCache.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: supabaseCache.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    serviceRoleKey: supabaseCache.SUPABASE_SERVICE_ROLE_KEY,
  } as const;
}

export function getAppEnv() {
  if (!appCache) {
    appCache = parseEnv(appEnvSchema, "app");
  }

  return {
    otpSecret: appCache.OTP_SECRET,
    cronSecret: appCache.CRON_SECRET,
  } as const;
}

export function getEmailEnv() {
  if (!emailCache) {
    emailCache = parseEnv(emailEnvSchema, "email");
  }

  return {
    apiKey: emailCache.EMAIL_PROVIDER_API_KEY,
    from: emailCache.EMAIL_FROM,
  } as const;
}

export function getAgentEnv() {
  if (!agentCache) {
    agentCache = parseEnv(agentEnvSchema, "agent");
  }

  return {
    url: agentCache.AGENT_SERVER_URL,
    secret: agentCache.AGENT_SERVER_SECRET,
  } as const;
}
