import { agentEnv } from "@/lib/env";
import type { AgentCommandPayload, AgentCommandResult } from "@/types/agent";
import type { ServiceResult } from "@/types/reservation";

export async function sendAgentCommand(
  payload: AgentCommandPayload
): Promise<ServiceResult<AgentCommandResult>> {
  let response: Response;

  try {
    response = await fetch(`${agentEnv.url}/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentEnv.secret}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { success: false, error: "Agent server unreachable" };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    return { success: false, error: `Agent error: ${text}` };
  }

  const data = await response.json().catch(() => null);
  if (!data) return { success: false, error: "Invalid response from agent server" };

  return { success: true, data };
}
