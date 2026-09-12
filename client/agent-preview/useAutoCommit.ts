import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";

import { autoCommitStartRpc, autoCommitStatusRpc } from "../../shared/auto-commit";

export type AutoCommitState =
  | { kind: "idle" }
  | { kind: "preparing"; message: string }
  | { kind: "running"; taskId: string; message: string }
  | { kind: "done"; taskId: string; message: string }
  | { kind: "error"; message: string; taskId?: string };

export function useAutoCommit(cwd: string | undefined, onDone: () => void) {
  const startTask = useRpc(autoCommitStartRpc);
  const getTaskStatus = useRpc(autoCommitStatusRpc);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<AutoCommitState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.kind !== "error") return;
    setCopied(false);
    const timer = setTimeout(() => setState({ kind: "idle" }), 8_000);
    return () => clearTimeout(timer);
  }, [state]);

  const start = useCallback(async () => {
    if (pending) return;
    if (!cwd) {
      setState({ kind: "error", message: "当前 agent 没有可用工作目录" });
      return;
    }
    setPending(true);
    setCopied(false);
    setState({ kind: "preparing", message: "正在启动 Pi 独立进程" });
    try {
      const { taskId } = await startTask({ cwd });
      setState({ kind: "running", taskId, message: "Pi 已启动，正在提交" });
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const status = await getTaskStatus({ taskId });
        const message = status.output.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "Pi 正在运行";
        if (status.status === "running") {
          setState({ kind: "running", taskId, message });
          continue;
        }
        if (status.status === "done") {
          setState({ kind: "done", taskId, message: message || "Pi 已完成提交" });
          onDone();
          return;
        }
        setState({ kind: "error", taskId, message: [status.error, status.output].filter(Boolean).join("\n").trim() || "Pi 提交失败" });
        return;
      }
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(false);
    }
  }, [cwd, getTaskStatus, onDone, pending, startTask]);

  const copyError = useCallback(() => {
    if (state.kind !== "error") return;
    void copyText(state.message).then(() => setCopied(true)).catch(() => {});
  }, [state]);

  return { state, pending, copied, start, copyError, dismiss: () => setState({ kind: "idle" }) };
}
