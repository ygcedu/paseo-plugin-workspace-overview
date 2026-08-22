import type { output as ZodOutput } from "zod";
import { listWorkspacesRpc } from "./overview.shared";

export function listWorkspaces(
  _input: ZodOutput<typeof listWorkspacesRpc.input>,
): ZodOutput<typeof listWorkspacesRpc.output> {
  // No-op handler — data is fetched client-side via usePaseo()
  return { workspaces: [] };
}
