export type AgentCommand =
  | "lock"
  | "unlock"
  | "restart"
  | "shutdown"
  | "screenshot"
  | "message";

export type AgentCommandPayload = {
  command: AgentCommand;
  device_id: string;
  hall_id: string;
  args?: Record<string, unknown>;
};

export type AgentCommandResult = {
  accepted: boolean;
  device_id: string;
  command: AgentCommand;
};
