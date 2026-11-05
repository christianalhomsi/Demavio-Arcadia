// agent-bridge: the only door between a hall's Hall Server and the database.
//
// Auth: `Authorization: Bearer <hall-server token>`. Only the SHA-256 of the token is stored (hall_servers.token_hash).
// The function runs with the service role INSIDE Supabase; no database key ever leaves the cloud. Every bridge_*
// database function re-checks the hall id it is given, which comes from the authenticated server, never from the body.
//
// Routes (POST, JSON):
//   /pair-server  {code, name}                  no auth; consumes a one-time hall_server code, returns {token, hallId} ONCE
//   /pair-agent   {code, stationId}             relays an agent pairing; returns {tenantId}
//   /pull         {cursor}                      durable pull of Queued commands after the cursor
//   /report       {commandId, status, result?, error?}
//   /heartbeat    {items: [...]}                batched agent heartbeats
//
// Errors are {error} with a plain code; database internals are never returned.
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY = 1_000_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Maps the contract errors raised by the database to HTTP; anything else is a generic 500. */
function fail(error: { message?: string; code?: string }) {
  const m = error.message ?? "";
  if (m === "PERMISSION_DENIED") return json({ error: "forbidden" }, 403);
  if (m === "NOT_FOUND") return json({ error: "not_found" }, 404);
  if (m === "VALIDATION") return json({ error: "invalid_request" }, 400);
  if (m === "PRECONDITION_FAILED") return json({ error: "precondition_failed" }, 409);
  console.error("agent-bridge database error", error.code, m);
  return json({ error: "internal" }, 500);
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "too_large" }, 413);

  const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "invalid_request" }, 400);

  // ---- pairing a Hall Server: no token yet, the one-time code is the credential ----
  if (route === "pair-server") {
    const { code, name } = body;
    if (typeof code !== "string" || code.length > 32) return json({ error: "invalid_request" }, 400);
    const token = newToken();
    const { data, error } = await admin.rpc("bridge_redeem_hall_server_code", {
      p_code: code,
      p_name: typeof name === "string" ? name : "Hall Server",
      p_token_hash: await sha256Hex(token),
    });
    if (error) return fail(error);
    return json({ token, hallId: data }); // the token is shown exactly once and never stored in plaintext
  }

  // ---- everything else: authenticate the hall-server token ----
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 200) return json({ error: "unauthorized" }, 401);

  const { data: rows, error: authError } = await admin.rpc("bridge_authenticate", {
    p_token_hash: await sha256Hex(token),
    p_version: typeof body.version === "string" ? body.version.slice(0, 40) : null,
  });
  if (authError) return fail(authError);
  const server = rows?.[0] as { hall_server_id: string; hall_id: string } | undefined;
  if (!server) return json({ error: "unauthorized" }, 401);

  switch (route) {
    case "pair-agent": {
      if (typeof body.code !== "string" || body.code.length > 32 || !isUuid(body.stationId)) {
        return json({ error: "invalid_request" }, 400);
      }
      const { data, error } = await admin.rpc("bridge_redeem_agent_code", {
        p_hall_id: server.hall_id,
        p_hall_server_id: server.hall_server_id,
        p_code: body.code,
        p_device_id: body.stationId,
      });
      if (error) return fail(error);
      return json({ tenantId: data });
    }
    case "pull": {
      const cursor = Number.isSafeInteger(body.cursor) ? (body.cursor as number) : 0;
      const { data, error } = await admin.rpc("bridge_pull_commands", {
        p_hall_id: server.hall_id,
        p_cursor: cursor,
        p_limit: 100,
      });
      if (error) return fail(error);
      return json(data);
    }
    case "report": {
      if (!isUuid(body.commandId) || typeof body.status !== "string") return json({ error: "invalid_request" }, 400);
      const { data, error } = await admin.rpc("bridge_report_command", {
        p_hall_id: server.hall_id,
        p_command_id: body.commandId,
        p_status: body.status,
        p_result: body.result ?? null,
        p_error: typeof body.error === "string" ? body.error : null,
      });
      if (error) return fail(error);
      return json({ changed: data });
    }
    case "heartbeat": {
      if (!Array.isArray(body.items)) return json({ error: "invalid_request" }, 400);
      const { data, error } = await admin.rpc("bridge_heartbeat_batch", {
        p_hall_id: server.hall_id,
        p_items: body.items,
      });
      if (error) return fail(error);
      return json({ updated: data });
    }
    default:
      return json({ error: "not_found" }, 404);
  }
});
