import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoClient } from "./workspace-creator-shared";
import type { AgentEntry } from "../../shared/overview-types";
import { autoCommitStartRpc, autoCommitStatusRpc } from "../../shared/auto-commit";
import { useTooltip } from "./Tooltip";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { AgentConversationTimeline } from "./AgentConversationTimeline";
import { ResizeHandle } from "./ResizeHandle";
import { createComposerStyles } from "./workspace-creator-styles";
import { SharedComposerInput } from "./SharedComposerInput";

function getColors(theme: PluginSurfaceProps["theme"]) {
  const fallback = {
    surface0: "#1e1e1e",
    foreground: "#ffffff",
    foregroundMuted: "#888888",
    accent: "#007acc",
    accentForeground: "#ffffff",
    statusDanger: "#ef4444",
    statusSuccess: "#22c55e",
  };
  if (!theme || !theme.colors) {
    return fallback;
  }
  return { ...fallback, ...theme.colors };
}

type AutoCommitState =
  | { kind: "idle" }
  | { kind: "preparing"; message: string }
  | { kind: "running"; taskId: string; message: string }
  | { kind: "done"; taskId: string; message: string }
  | { kind: "error"; message: string; taskId?: string };

function QuickActionButton({
  icon,
  color,
  disabled,
  tooltip,
  accessibilityLabel,
  onPress,
  style,
}: {
  icon: string;
  color: string;
  disabled?: boolean;
  tooltip: Array<{ key: string; value: string }>;
  accessibilityLabel: string;
  onPress: () => void;
  style: ViewStyle;
}) {
  const tooltipCtx = useTooltip();
  const buttonRef = useRef<View | null>(null);

  const showTooltip = useCallback(() => {
    if (!tooltipCtx || !buttonRef.current) return;
    buttonRef.current.measureInWindow((x, y, width, height) => {
      tooltipCtx.show({
        x: x + width,
        y: y + height,
        lines: tooltip,
      });
    });
  }, [tooltip, tooltipCtx]);

  const hideTooltip = useCallback(() => {
    tooltipCtx?.hide();
  }, [tooltipCtx]);

  return (
    <Pressable
      ref={buttonRef}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={[style, disabled && { opacity: 0.55 }]}
      {...({
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
      } as Record<string, unknown>)}
    >
      <Icon name={icon} size={14} color={color} />
    </Pressable>
  );
}

export function AgentConversationPreview({
  agent,
  workspaceDirectory,
  paseo,
  theme,
  onClose,
  onOpenFull,
}: {
  agent: AgentEntry;
  workspaceDirectory?: string;
  paseo: PaseoClient;
  theme: PluginSurfaceProps["theme"];
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const handle = useMemo(() => paseo.agents.ref(agent.id), [agent.id, paseo]);
  const [entries, setEntries] = useState<AgentTimelineEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState(agent.status);
  const loadingRef = useRef(false);
  const startAutoCommit = useRpc(autoCommitStartRpc);
  const getAutoCommitStatus = useRpc(autoCommitStatusRpc);
  const [autoCommitPending, setAutoCommitPending] = useState(false);
  const [autoCommitState, setAutoCommitState] = useState<AutoCommitState>({ kind: "idle" });
  const [autoCommitCopied, setAutoCommitCopied] = useState(false);
  const commitCwd = workspaceDirectory ?? agent.cwd;

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await handle.timeline.refetch({ direction: "tail", projection: "projected", limit: 200 });
      setEntries(page.entries);
      setError(page.error);
      const agentSnapshot = (page as { agent?: { status?: string; currentModeId?: string | null } | null }).agent;
      if (agentSnapshot?.status) {
        setLiveStatus(agentSnapshot.status as typeof liveStatus);
      } else if (handle.status) {
        setLiveStatus(handle.status);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    if (autoCommitState.kind !== "error") return;
    setAutoCommitCopied(false);
    const timer = setTimeout(() => setAutoCommitState({ kind: "idle" }), 8000);
    return () => clearTimeout(timer);
  }, [autoCommitState]);

  const handleAutoCommit = useCallback(async () => {
    if (autoCommitPending) return;
    if (!commitCwd) {
      setAutoCommitState({ kind: "error", message: "当前 agent 没有可用工作目录" });
      return;
    }

    setAutoCommitPending(true);
    setAutoCommitCopied(false);
    setAutoCommitState({ kind: "preparing", message: "正在启动 Pi 独立进程" });

    try {
      const { taskId } = await startAutoCommit({ cwd: commitCwd });
      setAutoCommitState({ kind: "running", taskId, message: "Pi 已启动，正在提交" });

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const status = await getAutoCommitStatus({ taskId });
        const message = status.output.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "Pi 正在运行";
        if (status.status === "running") {
          setAutoCommitState({ kind: "running", taskId, message });
          continue;
        }
        if (status.status === "done") {
          setAutoCommitState({ kind: "done", taskId, message: message || "Pi 已完成提交" });
          void refresh();
          return;
        }
        setAutoCommitState({
          kind: "error",
          taskId,
          message: [status.error, status.output].filter(Boolean).join("\n").trim() || "Pi 提交失败",
        });
        return;
      }
    } catch (commitError) {
      setAutoCommitState({ kind: "error", message: commitError instanceof Error ? commitError.message : String(commitError) });
    } finally {
      setAutoCommitPending(false);
    }
  }, [autoCommitPending, commitCwd, getAutoCommitStatus, refresh, startAutoCommit]);

  const handleCopyAutoCommitError = useCallback(() => {
    if (autoCommitState.kind !== "error") return;
    void copyText(autoCommitState.message).then(() => setAutoCommitCopied(true)).catch(() => {});
  }, [autoCommitState]);

  // Track live agent status via handle subscription + polling
  useEffect(() => {
    setLiveStatus(agent.status);
    const updateStatus = () => {
      const current = handle.current();
      if (current?.status) setLiveStatus(current.status);
    };
    updateStatus();
    const unsubscribe = handle.subscribe((update: Record<string, unknown>) => {
      const status = (update as { status?: string }).status;
      if (status) setLiveStatus(status as typeof liveStatus);
    });
    const timer = setInterval(updateStatus, 2000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [agent.id, agent.status, handle]);

  useEffect(() => {
    setEntries([]);
    setLoading(true);
    void refresh();
    const unsubscribe = handle.timeline.subscribe(() => void refresh());
    const timer = setInterval(() => void refresh(), agent.status === "running" ? 1200 : 4000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [agent.id, agent.status, handle, refresh]);

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await handle.send(text);
      setPrompt("");
      setLiveStatus("running");
      setTimeout(() => void refresh(), 250);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  }, [handle, prompt, refresh, sending]);

  const colors = getColors(theme);
  const composerStyles = useMemo(() => createComposerStyles(theme), [theme]);
  const styles = useMemo(() => ({
    ...composerStyles,
    panel: {
      height: "100%",
      borderLeftWidth: 1,
      borderLeftColor: colors.foregroundMuted + "22",
      backgroundColor: colors.surface0,
    } as ViewStyle,
    header: {
      height: 54,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.foregroundMuted + "22",
    } as ViewStyle,
    title: {
      flex: 1,
      color: colors.foreground,
      fontSize: 14,
      fontWeight: "600",
    } as TextStyle,
    subtitle: {
      color: colors.foregroundMuted,
      fontSize: 11,
    } as TextStyle,
    iconButton: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    autoCommitBar: {
      marginHorizontal: 10,
      marginBottom: 8,
      minHeight: 32,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "22",
      backgroundColor: colors.foregroundMuted + "0d",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    } as ViewStyle,
    quickActionButton: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "2f",
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    toastCopyButton: {
      height: 26,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "2f",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    } as ViewStyle,
    autoCommitToast: {
      marginHorizontal: 10,
      marginBottom: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.statusDanger + "66",
      backgroundColor: colors.surface0,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 20,
    } as ViewStyle,
  }), [colors, composerStyles]);

  const autoCommitColor =
    autoCommitState.kind === "error"
      ? colors.statusDanger
      : autoCommitState.kind === "done"
        ? colors.statusSuccess
        : autoCommitState.kind === "running" || autoCommitState.kind === "preparing"
          ? colors.accent
          : colors.foregroundMuted;
  const currentComposerSelection = useMemo(() => ({
    providerId: agent.provider,
    providerLabel: agent.provider,
    modelId: agent.model ?? null,
    modelLabel: agent.model ?? null,
    modeId: agent.currentModeId ?? null,
    modeLabel: agent.currentModeId ?? null,
    thinkingOptionId: agent.thinkingOptionId ?? null,
    thinkingLabel: agent.thinkingOptionId ?? null,
  }), [agent.currentModeId, agent.model, agent.provider, agent.thinkingOptionId]);

  return (
    <ResizeHandle
        theme={theme}
        side="left"
        variant="grip"
        initialWidth={420}
        minWidth={320}
        maxWidth={720}
        style={styles.panel}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{agent.title ?? agent.id.slice(0, 8)}</Text>
            <Text style={styles.subtitle}>{agent.provider}{agent.model ? ` · ${agent.model}` : ""} · {liveStatus}</Text>
          </View>
          <Pressable accessibilityLabel="打开完整会话" onPress={onOpenFull} style={styles.iconButton}><Icon name="ExternalLink" color={colors.foregroundMuted} size={16} /></Pressable>
          <Pressable accessibilityLabel="关闭会话预览" onPress={onClose} style={styles.iconButton}><Icon name="X" color={colors.foregroundMuted} size={16} /></Pressable>
        </View>
        {loading ? <Text style={{ color: colors.foregroundMuted, padding: 16 }}>加载会话中…</Text> : null}
        {error ? <Text style={{ color: colors.statusDanger, padding: 16 }}>{error}</Text> : null}
        <View style={{ flex: 1 }}>
          <AgentConversationTimeline entries={entries} theme={theme} />
          {autoCommitState.kind === "error" ? (
            <View style={styles.autoCommitToast}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <Icon name="TriangleAlert" size={14} color={colors.statusDanger} />
                <Text style={{ color: colors.statusDanger, fontSize: 12, fontWeight: "600", marginLeft: 7, flex: 1 }}>
                  一键提交失败
                </Text>
                <Pressable onPress={() => setAutoCommitState({ kind: "idle" })} style={{ padding: 2 }}>
                  <Icon name="X" size={13} color={colors.foregroundMuted} />
                </Pressable>
              </View>
              <Text selectable numberOfLines={4} style={{ color: colors.foreground, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
                {autoCommitState.message}
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                <Pressable onPress={handleCopyAutoCommitError} style={styles.toastCopyButton}>
                  <Icon name={autoCommitCopied ? "Check" : "Copy"} size={12} color={colors.foregroundMuted} />
                  <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                    {autoCommitCopied ? "已复制" : "复制错误"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.autoCommitBar}>
            <QuickActionButton
              icon={autoCommitPending ? "LoaderCircle" : autoCommitState.kind === "done" ? "CheckCircle2" : "GitCommitHorizontal"}
              color={autoCommitColor}
              disabled={autoCommitPending || !commitCwd}
              tooltip={[
                { key: "Action", value: "提交代码" },
                { key: "Status", value: autoCommitState.kind === "idle" ? "Ready" : autoCommitState.message },
                { key: "Directory", value: commitCwd ?? "无工作目录" },
              ]}
              accessibilityLabel="提交当前 Agent 工作目录改动"
              onPress={() => void handleAutoCommit()}
              style={styles.quickActionButton}
            />
          </View>
          <SharedComposerInput
            selection={currentComposerSelection}
            snapshot={null}
            providerLoading={false}
            openMenu={null}
            onToggleMenu={onOpenFull}
            onSelectModel={() => {}}
            onSelectMode={() => {}}
            onSelectThinking={() => {}}
            isAgentRunning={false}
            isCancelling={false}
            onCancel={onOpenFull}
            placeholder="继续跟进这个 Agent…"
            theme={theme}
            autoFocus
            disabled={sending}
            showAgentControls
            pendingLabel={sending ? "Sending" : null}
            value={prompt}
            onChangeText={setPrompt}
            onSubmit={submit}
          />
        </View>
    </ResizeHandle>
  );
}
