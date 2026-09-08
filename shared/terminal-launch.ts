import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const terminalLaunchRpc = defineRpc({
  name: "workspace_terminal_launch",
  input: z.object({
    workspaceDirectory: z.string().min(1),
    workspaceId: z.string().min(1),
    serverId: z.string().min(1),
    prompt: z.string(),
    profile: z
      .object({
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()),
      })
      .nullable(),
  }),
  output: z.object({ terminalId: z.string() }),
});
