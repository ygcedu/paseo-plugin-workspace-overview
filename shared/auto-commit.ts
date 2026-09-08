import { defineRpc } from "@getpaseo/plugin";
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

export const autoCommitStartRpc = defineRpc({
  name: "auto_commit_start",
  input: z.object({ cwd: z.string().min(1) }),
  output: z.object({
    taskId: z.string(),
    cwd: z.string(),
  }),
});

export const autoCommitStatusRpc = defineRpc({
  name: "auto_commit_status",
  input: z.object({ taskId: z.string().min(1) }),
  output: z.object({
    taskId: z.string(),
    cwd: z.string(),
    status: z.enum(["running", "done", "error"]),
    output: z.string(),
    error: z.string().nullable(),
    exitCode: z.number().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  }),
});
