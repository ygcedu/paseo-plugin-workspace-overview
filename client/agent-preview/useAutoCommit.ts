import { useCallback, useEffect, useRef, useState } from "react";
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

  const runRef = useRef<{ cancelled: boolean; cancelWait?: () => void } | null>(null);

  useEffect(() => {
    setPending(false);
    setState({ kind: "idle" });
    setCopied(false);
    return () => {
      const run = runRef.current;
      if (run) {
        run.cancelled = true;
        run.cancelWait?.();
      }
      runRef.current = null;
    };
  }, [cwd]);

  const start = useCallback(async () => {
    if (runRef.current) return;
    if (!cwd) {
      setState({ kind: "error", message: "当前 agent 没有可用工作目录" });
      return;
    }
    const run = { cancelled: false } as { cancelled: boolean; cancelWait?: () => void };
    runRef.current = run;
    setPending(true);
    setCopied(false);
    setState({ kind: "preparing", message: "正在启动 Pi 独立进程" });
    try {
      const { taskId } = await startTask({ cwd });
      if (run.cancelled) return;
      setState({ kind: "running", taskId, message: "Pi 已启动，正在提交" });
      for (;;) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1_200);
          run.cancelWait = () => { clearTimeout(timer); resolve(); };
        });
        run.cancelWait = undefined;
        if (run.cancelled) return;
        const status = await getTaskStatus({ taskId });
        if (run.cancelled) return;
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
      if (run.cancelled) return;
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (runRef.current === run) {
        runRef.current = null;
        setPending(false);
      }
    }
  }, [cwd, getTaskStatus, onDone, startTask]);

  const copyError = useCallback(() => {
    if (state.kind !== "error") return;
    void copyText(state.message).then(() => setCopied(true)).catch(() => {});
  }, [state]);

  return { state, pending, copied, start, copyError, dismiss: () => setState({ kind: "idle" }) };
}
