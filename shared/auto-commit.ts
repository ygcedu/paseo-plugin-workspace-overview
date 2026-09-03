import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const autoCommitInfoRpc = defineRpc({
  name: "auto_commit_info",
  input: z.object({}),
  output: z.object({
    cwd: z.string(),
    currentBranch: z.string().nullable(),
    hasChanges: z.boolean(),
    status: z.string(),
    recentMessages: z.array(z.string()),
  }),
});
