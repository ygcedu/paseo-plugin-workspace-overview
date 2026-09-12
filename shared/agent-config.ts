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
