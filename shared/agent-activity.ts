import type { AgentEntry } from "./overview-types";

/**
 * Returns the effective activity timestamp (ms since epoch) for an agent.
 *
 * Prefers `lastUserMessageAt` (real user interaction); falls back to
 * `updatedAt` (metadata/status change) so the agent still appears in
 * sorting and display without being invisible when no user message exists.
 * Returns 0 when neither field is available — sort-last sentinel.
 */
export function agentActivityMs(agent: AgentEntry): number {
  const iso = agent.lastUserMessageAt ?? agent.updatedAt;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}
