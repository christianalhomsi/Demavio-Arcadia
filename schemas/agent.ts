import { z } from "zod";

export const agentCommandSchema = z.object({
  command: z.enum(["lock", "unlock", "restart", "shutdown", "screenshot", "message"]),
  device_id: z.string().uuid(),
  hall_id: z.string().uuid(),
  args: z.record(z.unknown()).optional(),
});

export type AgentCommandInput = z.infer<typeof agentCommandSchema>;
