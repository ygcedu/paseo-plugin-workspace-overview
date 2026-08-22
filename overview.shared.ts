import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

// RPC defined for potential future server-side enrichment.
// Current implementation fetches data client-side via usePaseo().
export const listWorkspacesRpc = defineRpc({
  name: "workspace-overview.list",
  input: z.object({}),
  output: z.object({
    workspaces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        projectDisplayName: z.string(),
        directory: z.string(),
        kind: z.string(),
        status: z.string(),
        statusEnteredAt: z.string().nullable(),
        agentCount: z.number(),
      }),
    ),
  }),
});
