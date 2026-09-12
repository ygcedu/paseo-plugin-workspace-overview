import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoClient } from "./workspace-creator-shared";
import type { AgentEntry } from "../../shared/overview-types";
import { useTooltip } from "./Tooltip";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { AgentConversationTimeline } from "./AgentConversationTimeline";
import { ResizeHandle } from "./ResizeHandle";
import { createComposerStyles } from "./workspace-creator-styles";
import { SharedComposerInput } from "./SharedComposerInput";
import { agentConfigSetRpc } from "../../shared/agent-config";
import { buildSelection, type ComposerSelection, type ProviderSnapshot } from "./workspace-creator-shared";
import { useAutoCommit } from "../agent-preview/useAutoCommit";

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
  const [configPending, setConfigPending] = useState(false);
  const [composerSelection, setComposerSelection] = useState<ComposerSelection | null>(null);
  const [providerSnapshot, setProviderSnapshot] = useState<ProviderSnapshot | null>(null);
  const [openMenu, setOpenMenu] = useState<"model" | "mode" | "thinking" | null>(null);
  const [liveStatus, setLiveStatus] = useState(agent.status);
  const loadingRef = useRef(false);
  const setAgentConfig = useRpc(agentConfigSetRpc);
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

  const autoCommit = useAutoCommit(commitCwd, refresh);

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

  useEffect(() => {
    let cancelled = false;
    const provider = agent.provider as Parameters<typeof paseo.providers.listModels>[0];
    void Promise.all([
      paseo.providers.listModels(provider, { cwd: workspaceDirectory ?? agent.cwd }),
      paseo.providers.listModes(provider, { cwd: workspaceDirectory ?? agent.cwd }),
    ]).then(([modelsResult, modesResult]) => {
      if (cancelled) return;
      const models = modelsResult.models ?? [];
      const modes = modesResult.modes ?? [];
      const entry = {
        provider: agent.provider,
        label: agent.provider,
        status: "ready" as const,
        enabled: true,
        models,
        modes,
      };
      const model = models.find((item) => item.id === agent.model) ?? models[0] ?? null;
      const next = buildSelection(entry, model);
      setComposerSelection({
        ...next,
        modeId: agent.currentModeId ?? next.modeId,
        modeLabel: modes.find((item) => item.id === agent.currentModeId)?.label ?? agent.currentModeId ?? next.modeLabel,
        thinkingOptionId: agent.thinkingOptionId ?? next.thinkingOptionId,
        thinkingLabel: model?.thinkingOptions?.find((item) => item.id === agent.thinkingOptionId)?.label ?? agent.thinkingOptionId ?? next.thinkingLabel,
      });
      setProviderSnapshot({ entries: [entry] });
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    return () => { cancelled = true; };
  }, [agent.currentModeId, agent.cwd, agent.model, agent.provider, agent.thinkingOptionId, paseo, workspaceDirectory]);

  const updateAgentConfig = useCallback(async (field: "model" | "mode" | "thinking", value: string) => {
    if (configPending) return;
    setConfigPending(true);
    setError(null);
    try {
      await setAgentConfig({ agentId: agent.id, field, value });
      setComposerSelection((current) => {
        if (!current) return current;
        if (field === "model") {
          const model = providerSnapshot?.entries[0]?.models?.find((item) => item.id === value);
          return { ...current, modelId: value, modelLabel: model?.label ?? value, thinkingOptionId: model?.defaultThinkingOptionId ?? null, thinkingLabel: model?.thinkingOptions?.find((item) => item.id === model.defaultThinkingOptionId)?.label ?? model?.defaultThinkingOptionId ?? null };
        }
        if (field === "mode") {
          const mode = providerSnapshot?.entries[0]?.modes?.find((item) => item.id === value);
          return { ...current, modeId: value, modeLabel: mode?.label ?? value };
        }
        const model = providerSnapshot?.entries[0]?.models?.find((item) => item.id === current.modelId);
        const thinking = model?.thinkingOptions?.find((item) => item.id === value);
        return { ...current, thinkingOptionId: value, thinkingLabel: thinking?.label ?? value };
      });
      setOpenMenu(null);
      void refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setConfigPending(false);
    }
  }, [agent.id, configPending, providerSnapshot, refresh, setAgentConfig]);

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
      marginHorizontal: 12,
      marginBottom: 10,
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
    composerDock: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.foregroundMuted + "18",
      backgroundColor: colors.surface0,
    } as ViewStyle,
  }), [colors, composerStyles]);

  const autoCommitColor =
    autoCommit.state.kind === "error"
      ? colors.statusDanger
      : autoCommit.state.kind === "done"
        ? colors.statusSuccess
        : autoCommit.state.kind === "running" || autoCommit.state.kind === "preparing"
          ? colors.accent
          : colors.foregroundMuted;

  return (
    <ResizeHandle
        theme={theme}
        side="left"
        variant="grip"
        initialWidth={480}
        minWidth={360}
        maxWidth={800}
        style={styles.panel}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{agent.title ?? agent.id.slice(0, 8)}</Text>
            <Text style={styles.subtitle}>{agent.provider}{agent.model ? ` · ${agent.model}` : ""} · {liveStatus}</Text>
          </View>
          <QuickActionButton
            icon={autoCommit.pending ? "LoaderCircle" : autoCommit.state.kind === "done" ? "CheckCircle2" : "GitCommitHorizontal"}
            color={autoCommitColor}
            disabled={autoCommit.pending || !commitCwd}
            tooltip={[
              { key: "Action", value: "提交代码" },
              { key: "Status", value: autoCommit.state.kind === "idle" ? "Ready" : autoCommit.state.message },
              { key: "Directory", value: commitCwd ?? "无工作目录" },
            ]}
            accessibilityLabel="提交当前 Agent 工作目录改动"
            onPress={() => void autoCommit.start()}
            style={styles.quickActionButton}
          />
          <Pressable accessibilityLabel="打开完整会话" onPress={onOpenFull} style={styles.iconButton}><Icon name="ExternalLink" color={colors.foregroundMuted} size={16} /></Pressable>
          <Pressable accessibilityLabel="关闭会话预览" onPress={onClose} style={styles.iconButton}><Icon name="X" color={colors.foregroundMuted} size={16} /></Pressable>
        </View>
        {loading ? <Text style={{ color: colors.foregroundMuted, padding: 16 }}>加载会话中…</Text> : null}
        {error ? <Text style={{ color: colors.statusDanger, padding: 16 }}>{error}</Text> : null}
        <View style={{ flex: 1 }}>
          <AgentConversationTimeline entries={entries} theme={theme} />
          {autoCommit.state.kind === "error" ? (
            <View style={styles.autoCommitToast}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <Icon name="TriangleAlert" size={14} color={colors.statusDanger} />
                <Text style={{ color: colors.statusDanger, fontSize: 12, fontWeight: "600", marginLeft: 7, flex: 1 }}>
                  一键提交失败
                </Text>
                <Pressable onPress={autoCommit.dismiss} style={{ padding: 2 }}>
                  <Icon name="X" size={13} color={colors.foregroundMuted} />
                </Pressable>
              </View>
              <Text selectable numberOfLines={4} style={{ color: colors.foreground, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
                {autoCommit.state.message}
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                <Pressable onPress={autoCommit.copyError} style={styles.toastCopyButton}>
                  <Icon name={autoCommit.copied ? "Check" : "Copy"} size={12} color={colors.foregroundMuted} />
                  <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                    {autoCommit.copied ? "已复制" : "复制错误"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.composerDock}>
            <SharedComposerInput
            selection={composerSelection}
            snapshot={providerSnapshot}
            providerLoading={false}
            openMenu={openMenu}
            onToggleMenu={(menu) => setOpenMenu(menu === "model" || menu === "mode" || menu === "thinking" ? menu : null)}
            onSelectModel={(combinedId) => void updateAgentConfig("model", combinedId.includes("::") ? combinedId.slice(combinedId.indexOf("::") + 2) : combinedId)}
            onSelectMode={(modeId) => void updateAgentConfig("mode", modeId)}
            onSelectThinking={(thinkingId) => void updateAgentConfig("thinking", thinkingId)}
            isAgentRunning={false}
            isCancelling={false}
            onCancel={onOpenFull}
            placeholder="继续跟进这个 Agent…"
            theme={theme}
            autoFocus
            disabled={sending || configPending}
            showAgentControls
            pendingLabel={sending ? "Sending" : null}
            value={prompt}
            onChangeText={setPrompt}
              onSubmit={submit}
            />
          </View>
        </View>
    </ResizeHandle>
  );
}
