import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { RpcInput } from "@getpaseo/plugin";
import { agentCancelRpc, agentConfigSetRpc, agentRewindRpc } from "../shared/agent-config";

let clientPromise: Promise<DaemonClient> | null = null;

async function getClient(): Promise<DaemonClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new DaemonClient({
        url: "ws://127.0.0.1:6767/ws",
        clientId: `workspace-overview-${process.pid}`,
        clientType: "cli",
        appVersion: "0.8.0",
        reconnect: { enabled: false },
      });
      await client.connect();
      return client;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function setAgentConfig({ agentId, field, value }: RpcInput<typeof agentConfigSetRpc>) {
  const client = await getClient();
  if (field === "model") await client.setAgentModel(agentId, value);
  else if (field === "mode") await client.setAgentMode(agentId, value);
  else await client.setAgentThinkingOption(agentId, value);
  return { ok: true as const };
}

export async function cancelAgent({ agentId }: RpcInput<typeof agentCancelRpc>) {
  const client = await getClient();
  await client.cancelAgent(agentId);
  return { ok: true as const };
}

export async function rewindAgent({ agentId, messageId, mode }: RpcInput<typeof agentRewindRpc>) {
  const client = await getClient();
  await client.rewindAgent(agentId, messageId, mode);
  return { ok: true as const };
}

export async function closeAgentConfigClient() {
  const pending = clientPromise;
  clientPromise = null;
  if (pending) await (await pending).close();
}
