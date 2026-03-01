export type StreamEvent =
  | { type: 'worker:text'; workerId: string; text: string }
  | { type: 'worker:tool_use'; workerId: string; tool: string; input: string }
  | { type: 'worker:tool_result'; workerId: string; tool: string; output: string }
  | { type: 'supervisor:text'; text: string }

/** Raw content block emitted by dispatchers — no workerId, stamped by AgentNetwork. */
export type RawStreamBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string; input: string }
  | { type: 'tool_result'; tool: string; output: string }
