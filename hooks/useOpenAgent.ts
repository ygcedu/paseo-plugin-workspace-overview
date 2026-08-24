import { useRpc } from "@getpaseo/plugin";
import { useCallback } from "react";
import { openAgentRpc } from "../shared/open-agent";

/**
 * Returns a handler that opens an agent session in the Paseo desktop app.
 * Goes through the plugin RPC → daemon plugin process → OS deep link path.
 */
export function useOpenAgent(serverId: string) {
  const invoke = useRpc(openAgentRpc);

  const openAgent = useCallback(
    (agentId: string) =>
      invoke({ agentId, serverId }).catch((err) => {
        console.error("[workspace-overview] open_agent failed:", err);
      }),
    [invoke, serverId],
  );

  return { openAgent };
}
