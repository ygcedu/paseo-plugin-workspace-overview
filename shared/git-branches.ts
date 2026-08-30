import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const gitBranchesRpc = defineRpc({
  name: "git_branches_list",
  input: z.object({ projectDirectory: z.string().min(1) }),
  output: z.object({
    currentBranch: z.string().nullable(),
    defaultBranch: z.string().nullable(),
    branches: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        detail: z.string(),
      }),
    ),
  }),
});
