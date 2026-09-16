import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { ComposerSelection, PaseoClient, ProviderSnapshot } from "../workspace-creator/types";
import type { AgentEntry } from "../../shared/overview-types";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { AgentConversationTimeline } from "./AgentConversationTimeline";
import { ResizeHandle } from "./ResizeHandle";
import { createComposerStyles } from "./workspace-creator-styles";
import { SharedComposerInput } from "./SharedComposerInput";
import { agentCancelRpc, agentConfigSetRpc, agentRewindRpc } from "../../shared/agent-config";
import { buildSelection } from "../workspace-creator/provider-selection";
import { useAutoCommit } from "../agent-preview/useAutoCommit";
import { AutoCommitErrorToast, QuickActionButton } from "../agent-preview/PreviewActions";
import type { AgentPermissionRequest, AgentPermissionResponse, AgentUsage } from "@getpaseo/protocol/agent-types";
import { AgentCommandMenu, filterAgentCommands, type AgentSlashCommand } from "./AgentCommandMenu";

type AgentTimelineCursor = { epoch: string; seq: number };
type QueuedMessage = { id: string; text: string };

const queueStorageKey = (agentId: string) => `workspace-overview:agent-queue:${agentId}`;

function loadQueuedMessages(agentId: string): QueuedMessage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(queueStorageKey(agentId)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is QueuedMessage => typeof item?.id === "string" && typeof item?.text === "string")
      : [];
  } catch {
    return [];
  }
}

function saveQueuedMessages(agentId: string, messages: QueuedMessage[]) {
  if (typeof localStorage === "undefined") return;
  try {
    if (messages.length === 0) localStorage.removeItem(queueStorageKey(agentId));
    else localStorage.setItem(queueStorageKey(agentId), JSON.stringify(messages));
  } catch {
    // Queueing still works in memory when browser storage is unavailable.
  }
}

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

export function AgentConversationPreview({
  agent,
  workspaceDirectory,
  paseo,
  theme,
  onClose,
  onOpenFull,
  initialPanelWidth = 480,
  maxPanelWidth = 800,
  compact = false,
}: {
  agent: AgentEntry;
  workspaceDirectory?: string;
  paseo: PaseoClient;
  theme: PluginSurfaceProps["theme"];
  onClose: () => void;
  onOpenFull: () => void;
  initialPanelWidth?: number;
  maxPanelWidth?: number;
  compact?: boolean;
}) {
  const handle = useMemo(() => paseo.agents.ref(agent.id), [agent.id, paseo]);
  const [entries, setEntries] = useState<AgentTimelineEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [configPending, setConfigPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [composerSelection, setComposerSelection] = useState<ComposerSelection | null>(null);
  const [providerSnapshot, setProviderSnapshot] = useState<ProviderSnapshot | null>(null);
  const [openMenu, setOpenMenu] = useState<"model" | "mode" | "thinking" | null>(null);
  const [liveStatus, setLiveStatus] = useState(agent.status);
  const [pendingPermissions, setPendingPermissions] = useState<AgentPermissionRequest[]>([]);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [startCursor, setStartCursor] = useState<AgentTimelineCursor | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [scrollToEndVersion, setScrollToEndVersion] = useState(0);
  const [commands, setCommands] = useState<AgentSlashCommand[]>([]);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [commandsError, setCommandsError] = useState<string | null>(null);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [lastUsage, setLastUsage] = useState<AgentUsage | null>(null);
  const [activeTurnStartedAt, setActiveTurnStartedAt] = useState<string | null>(null);
  const [lastAgentError, setLastAgentError] = useState<string | null>(null);
  const [queuedState, setQueuedState] = useState<{ agentId: string; messages: QueuedMessage[] }>(() => ({
    agentId: agent.id,
    messages: loadQueuedMessages(agent.id),
  }));
  const queuedMessages = queuedState.agentId === agent.id ? queuedState.messages : [];
  const updateQueuedMessages = useCallback((update: (current: QueuedMessage[]) => QueuedMessage[]) => {
    setQueuedState((currentState) => {
      const current = currentState.agentId === agent.id ? currentState.messages : loadQueuedMessages(agent.id);
      const messages = update(current);
      saveQueuedMessages(agent.id, messages);
      return { agentId: agent.id, messages };
    });
  }, [agent.id]);
  const [rewindingMessageId, setRewindingMessageId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const historyInitializedRef = useRef(false);
  const latestSeqRef = useRef<number | undefined>(undefined);
  const setAgentConfig = useRpc(agentConfigSetRpc);
  const cancelAgent = useRpc(agentCancelRpc);
  const rewindAgent = useRpc(agentRewindRpc);
  const commitCwd = workspaceDirectory ?? agent.cwd;

  useEffect(() => {
    setQueuedState({ agentId: agent.id, messages: loadQueuedMessages(agent.id) });
  }, [agent.id]);

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await handle.timeline.refetch({ direction: "tail", projection: "projected", limit: 200 });
      const nextLatest = page.entries.at(-1)?.seqStart;
      if (latestSeqRef.current !== nextLatest) {
        latestSeqRef.current = nextLatest;
        setScrollToEndVersion((version) => version + 1);
      }
      setEntries((current) => {
        if (current.length === 0) return page.entries;
        const merged = new Map(current.map((entry) => [entry.seqStart, entry]));
        for (const entry of page.entries) merged.set(entry.seqStart, entry);
        return Array.from(merged.values()).sort((left, right) => left.seqStart - right.seqStart);
      });
      if (!historyInitializedRef.current) {
        historyInitializedRef.current = true;
        setStartCursor(page.startCursor);
        setHasOlder(page.hasOlder);
      }
      setError(page.error);
      const agentSnapshot = (page as { agent?: { status?: string; currentModeId?: string | null } | null }).agent;
      const usage = (page as { agent?: { lastUsage?: AgentUsage } | null }).agent?.lastUsage ?? handle.lastUsage;
      setLastUsage(usage ?? null);
      const activeTurn = (page as { agent?: { activeTurn?: { startedAt?: string | null } | null } | null }).agent?.activeTurn ?? handle.activeTurn;
      setActiveTurnStartedAt(activeTurn?.startedAt ?? null);
      const agentError = (page as { agent?: { lastError?: string | null } | null }).agent?.lastError ?? handle.lastError;
      setLastAgentError(agentError ?? null);
      const permissions = (page as { agent?: { pendingPermissions?: AgentPermissionRequest[] } | null }).agent?.pendingPermissions
        ?? handle.pendingPermissions
        ?? [];
      setPendingPermissions(permissions);
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

  const loadOlder = useCallback(async () => {
    if (!startCursor || !hasOlder || loadingOlder) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const page = await handle.timeline.refetch({ direction: "before", cursor: startCursor, projection: "projected", limit: 200 });
      setEntries((current) => {
        const merged = new Map(current.map((entry) => [entry.seqStart, entry]));
        for (const entry of page.entries) merged.set(entry.seqStart, entry);
        return Array.from(merged.values()).sort((left, right) => left.seqStart - right.seqStart);
      });
      setStartCursor(page.startCursor);
      setHasOlder(page.hasOlder);
      if (page.error) setError(page.error);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingOlder(false);
    }
  }, [handle, hasOlder, loadingOlder, startCursor]);

  const respondToPermission = useCallback(async (requestId: string, response: AgentPermissionResponse) => {
    if (respondingRequestId) return;
    setRespondingRequestId(requestId);
    setError(null);
    try {
      await handle.respondToPermission({ requestId, response });
      setPendingPermissions((current) => current.filter((request) => request.id !== requestId));
      setTimeout(() => void refresh(), 250);
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : String(responseError));
    } finally {
      setRespondingRequestId(null);
    }
  }, [handle, refresh, respondingRequestId]);

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
    setCommands([]);
    setCommandsError(null);
    setLastAgentError(null);
    historyInitializedRef.current = false;
    latestSeqRef.current = undefined;
    setStartCursor(null);
    setHasOlder(false);
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
    if (!text || sending || pendingPermissions.length > 0) return;
    if (liveStatus === "running") {
      updateQueuedMessages((current) => [...current, { id: `${Date.now()}-${current.length}`, text }]);
      setPrompt("");
      return;
    }
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
  }, [handle, liveStatus, pendingPermissions.length, prompt, refresh, sending, updateQueuedMessages]);

  useEffect(() => {
    if (liveStatus === "running" || sending || pendingPermissions.length > 0 || queuedMessages.length === 0) return;
    const next = queuedMessages[0];
    setSending(true);
    setError(null);
    void handle.send(next.text).then(() => {
      updateQueuedMessages((current) => current.filter((item) => item.id !== next.id));
      setLiveStatus("running");
      setTimeout(() => void refresh(), 250);
    }).catch((sendError: unknown) => {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    }).finally(() => setSending(false));
  }, [handle, liveStatus, pendingPermissions.length, queuedMessages, refresh, sending, updateQueuedMessages]);

  const slashMatch = prompt.match(/^\/([^\s/]*)$/);
  const commandQuery = slashMatch?.[1] ?? null;
  const matchingCommands = commandQuery === null ? [] : filterAgentCommands(commands, commandQuery);
  useEffect(() => setActiveCommandIndex(0), [commandQuery]);
  useEffect(() => {
    if (commandQuery === null || commands.length > 0 || commandsLoading) return;
    setCommandsLoading(true);
    setCommandsError(null);
    void handle.commands().then((result) => {
      setCommands(result.commands);
      setCommandsError(result.error);
    }).catch((commandError: unknown) => {
      setCommandsError(commandError instanceof Error ? commandError.message : String(commandError));
    }).finally(() => setCommandsLoading(false));
  }, [commandQuery, commands.length, commandsLoading, handle]);

  const cancel = useCallback(async () => {
    if (cancelling || liveStatus !== "running") return;
    setCancelling(true);
    setError(null);
    try {
      await cancelAgent({ agentId: agent.id });
      setLiveStatus("idle");
      setTimeout(() => void refresh(), 250);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    } finally {
      setCancelling(false);
    }
  }, [agent.id, cancelAgent, cancelling, liveStatus, refresh]);

  const rewind = useCallback(async (messageId: string, text: string, mode: "conversation" | "files" | "both") => {
    if (rewindingMessageId || liveStatus === "running") return;
    setRewindingMessageId(messageId);
    setError(null);
    try {
      await rewindAgent({ agentId: agent.id, messageId, mode });
      setEntries([]);
      historyInitializedRef.current = false;
      latestSeqRef.current = undefined;
      setStartCursor(null);
      setHasOlder(false);
      if (mode !== "files") setPrompt(text);
      await refresh();
    } catch (rewindError) {
      setError(rewindError instanceof Error ? rewindError.message : String(rewindError));
    } finally {
      setRewindingMessageId(null);
    }
  }, [agent.id, liveStatus, refresh, rewindAgent, rewindingMessageId]);

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
        initialWidth={initialPanelWidth}
        minWidth={360}
        maxWidth={maxPanelWidth}
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
        {!error && lastAgentError ? <View accessibilityRole="alert" style={{ marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.statusDanger + "66", flexDirection: "row", gap: 8 }}><Icon name="CircleX" size={15} color={colors.statusDanger} /><Text selectable style={{ flex: 1, color: colors.statusDanger, fontSize: 12, lineHeight: 18 }}>{lastAgentError}</Text></View> : null}
        <View style={{ flex: 1 }}>
          <AgentConversationTimeline
            entries={entries}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            onLoadOlder={() => void loadOlder()}
            scrollToEndVersion={scrollToEndVersion}
            isRunning={liveStatus === "running"}
            activeTurnStartedAt={activeTurnStartedAt}
            pendingPermissions={pendingPermissions}
            respondingRequestId={respondingRequestId}
            onRespond={(requestId, response) => void respondToPermission(requestId, response)}
            rewindCapabilities={handle.capabilities}
            rewindingMessageId={rewindingMessageId}
            onRewind={(messageId, text, mode) => void rewind(messageId, text, mode)}
            theme={theme}
            compact={compact}
          />
          {autoCommit.state.kind === "error" ? (
            <AutoCommitErrorToast
              message={autoCommit.state.message}
              copied={autoCommit.copied}
              colors={colors}
              containerStyle={styles.autoCommitToast}
              copyButtonStyle={styles.toastCopyButton}
              onDismiss={autoCommit.dismiss}
              onCopy={autoCommit.copyError}
            />
          ) : null}
          <View style={styles.composerDock}>
            {queuedMessages.length ? <View accessibilityLabel="已排队消息" style={{ gap: 6, marginBottom: 8 }}>
              {queuedMessages.map((item, index) => <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.surface0, borderWidth: 1, borderColor: colors.foregroundMuted + "33" }}>
                <Text numberOfLines={2} style={{ flex: 1, color: colors.foregroundMuted, fontSize: 12 }}>{index + 1}. {item.text}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="编辑排队消息" onPress={() => { setPrompt(item.text); updateQueuedMessages((current) => current.filter((candidate) => candidate.id !== item.id)); }} style={styles.iconButton}><Icon name="Pencil" size={13} color={colors.foregroundMuted} /></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="删除排队消息" onPress={() => updateQueuedMessages((current) => current.filter((candidate) => candidate.id !== item.id))} style={styles.iconButton}><Icon name="X" size={13} color={colors.foregroundMuted} /></Pressable>
              </View>)}
            </View> : null}
            {commandQuery !== null && pendingPermissions.length === 0 ? <AgentCommandMenu
              commands={commands}
              query={commandQuery}
              loading={commandsLoading}
              error={commandsError}
              theme={theme}
              activeIndex={activeCommandIndex}
              onSelect={(command) => setPrompt(`/${command.name} `)}
            /> : null}
            <SharedComposerInput
            selection={composerSelection}
            snapshot={providerSnapshot}
            providerLoading={false}
            openMenu={openMenu}
            onToggleMenu={(menu) => setOpenMenu(menu === "model" || menu === "mode" || menu === "thinking" ? menu : null)}
            onSelectModel={(combinedId) => void updateAgentConfig("model", combinedId.includes("::") ? combinedId.slice(combinedId.indexOf("::") + 2) : combinedId)}
            onSelectMode={(modeId) => void updateAgentConfig("mode", modeId)}
            onSelectThinking={(thinkingId) => void updateAgentConfig("thinking", thinkingId)}
            isAgentRunning={liveStatus === "running"}
            isCancelling={cancelling}
            onCancel={() => void cancel()}
            placeholder="继续跟进这个 Agent…"
            theme={theme}
            autoFocus
            disabled={sending || configPending || pendingPermissions.length > 0}
            showAgentControls
            pendingLabel={sending ? "Sending" : pendingPermissions.length > 0 ? "请先处理上方请求" : null}
            value={prompt}
            onChangeText={setPrompt}
              onKeyPress={(event) => {
                const key = event.nativeEvent.key;
                if (commandQuery === null) {
                  if (key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                  return;
                }
                if (key === "ArrowDown" || key === "ArrowUp") {
                  event.preventDefault();
                  if (matchingCommands.length) setActiveCommandIndex((current) => (current + (key === "ArrowDown" ? 1 : -1) + matchingCommands.length) % matchingCommands.length);
                } else if (key === "Enter" && matchingCommands[activeCommandIndex]) {
                  event.preventDefault();
                  setPrompt(`/${matchingCommands[activeCommandIndex].name} `);
                } else if (key === "Escape") {
                  event.preventDefault();
                  setPrompt("");
                }
              }}
              onSubmit={submit}
              usage={lastUsage}
            />
          </View>
        </View>
    </ResizeHandle>
  );
}
