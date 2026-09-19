import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const agentConfigSetRpc = defineRpc({
  name: "overview.agent-config.set",
  input: z.object({
    agentId: z.string().min(1),
    field: z.enum(["model", "mode", "thinking"]),
    value: z.string().min(1),
  }),
  output: z.object({ ok: z.literal(true) }),
});

export const agentCancelRpc = defineRpc({
  name: "overview.agent.cancel",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ ok: z.literal(true) }),
});

export const agentRewindRpc = defineRpc({
  name: "overview.agent.rewind",
  input: z.object({ agentId: z.string().min(1), messageId: z.string().min(1), mode: z.enum(["conversation", "files", "both"]) }),
  output: z.object({ ok: z.literal(true) }),
});

export const pluginReloadRpc = defineRpc({
  name: "overview.plugin.reload",
  input: z.object({ pluginId: z.string().min(1) }),
  output: z.object({ ok: z.literal(true) }),
});
