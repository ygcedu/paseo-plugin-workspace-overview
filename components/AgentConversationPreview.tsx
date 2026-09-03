import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ThreadMessageLike,
} from "@assistant-ui/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import type { PaseoClient } from "./workspace-creator-shared";
import type { AgentEntry } from "../overview.types";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { AgentConversationTimeline } from "./AgentConversationTimeline";
import { ResizeHandle } from "./ResizeHandle";
import { createComposerStyles } from "./workspace-creator-styles";
import { SharedComposerInput } from "./SharedComposerInput";
import {
  providerById,
  selectableModels,
  defaultSelection,
  readPaseoProviderModelPreference,
  PROVIDER_READY_TIMEOUT_MS,
  buildSelection,
  type ComposerSelection,
  type OpenMenu,
  type ProviderSnapshot,
} from "./workspace-creator-shared";

function getColors(theme: PluginSurfaceProps["theme"]) {
  const fallback = {
    surface0: "#1e1e1e",
    foreground: "#ffffff",
    foregroundMuted: "#888888",
    accent: "#007acc",
    accentForeground: "#ffffff",
    statusDanger: "#ef4444",
  };
  if (!theme || !theme.colors) {
    return fallback;
  }
  return { ...fallback, ...theme.colors };
}

function submittedText(options: ChatModelRunOptions): string {
  const user = [...options.messages].reverse().find((message) => message.role === "user");
  if (!user) return "";
  return user.content
    .filter((part): part is Extract<(typeof user.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function toolSummary(item: AgentTimelineEntry["item"]): string {
  const detail = item.detail as { command?: string; path?: string; description?: string };
  const subject = detail.command ?? detail.path ?? detail.description;
  return [`Tool: ${item.name}`, subject, `Status: ${item.status}`].filter(Boolean).join("\n");
}

function timelineMessages(entries: AgentTimelineEntry[]): ThreadMessageLike[] {
  const messages: ThreadMessageLike[] = [];
  for (const entry of entries) {
    const item = entry.item;
    const base = { id: item.type === "user_message" || item.type === "assistant_message" ? item.messageId : undefined, createdAt: new Date(entry.timestamp) };
    if (item.type === "user_message") messages.push({ ...base, id: base.id ?? `user-${entry.seqStart}`, role: "user", content: item.text });
    else if (item.type === "assistant_message") messages.push({ ...base, id: base.id ?? `assistant-${entry.seqStart}`, role: "assistant", content: item.text });
    else if (item.type === "reasoning") messages.push({ id: `reasoning-${entry.seqStart}`, role: "assistant", content: [{ type: "reasoning", text: item.text }] });
    else if (item.type === "tool_call") messages.push({ id: `tool-${entry.seqStart}`, role: "assistant", content: toolSummary(item) });
    else if (item.type === "todo") messages.push({ id: `todo-${entry.seqStart}`, role: "assistant", content: item.items.map((todo: { completed: boolean; text: string }) => `${todo.completed ? "[x]" : "[ ]"} ${todo.text}`).join("\n") });
    else if (item.type === "error") messages.push({ id: `error-${entry.seqStart}`, role: "assistant", content: `Error: ${item.message}` });
  }
  return messages;
}

function selectionFromAgent(snapshot: ProviderSnapshot, agent: AgentEntry | Record<string, unknown>): ComposerSelection | null {
  const agentRecord = agent as Record<string, unknown>;
  const rawProvider = typeof agentRecord.provider === "string" ? agentRecord.provider : "";
  const separator = rawProvider.indexOf("/");
  const providerId = separator >= 0 ? rawProvider.slice(0, separator) : rawProvider;
  const modelIdFromProvider = separator >= 0 ? rawProvider.slice(separator + 1) : null;
  const rawModel = typeof agentRecord.model === "string" ? agentRecord.model : null;
  const modelId = rawModel ?? modelIdFromProvider;
  const entry = providerById(snapshot, providerId);
  if (!entry) return defaultSelection(snapshot, readPaseoProviderModelPreference());

  const model =
    modelId
      ? selectableModels(entry).find((item) => item.id === modelId || item.label === modelId) ?? undefined
      : undefined;
  const selection = buildSelection(entry, model);
  const modeId =
    typeof agentRecord.currentModeId === "string"
      ? agentRecord.currentModeId
      : typeof agentRecord.modeId === "string"
        ? agentRecord.modeId
        : selection.modeId;
  const mode = entry.modes?.find((item) => item.id === modeId);
  const thinkingOptionId =
    typeof agentRecord.thinkingOptionId === "string"
      ? agentRecord.thinkingOptionId
      : typeof agentRecord.effectiveThinkingOptionId === "string"
        ? agentRecord.effectiveThinkingOptionId
        : selection.thinkingOptionId;
  const thinking = (model ?? selectableModels(entry).find((item) => item.id === selection.modelId))
    ?.thinkingOptions?.find((item) => item.id === thinkingOptionId);

  return {
    ...selection,
    modeId,
    modeLabel: mode?.label ?? mode?.id ?? modeId,
    thinkingOptionId,
    thinkingLabel: thinking?.label ?? thinking?.id ?? thinkingOptionId,
  };
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
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [liveStatus, setLiveStatus] = useState(agent.status);
  const loadingRef = useRef(false);

  // Provider/model/mode/thinking selection state (mirrors WorkspaceCreateComposer)
  const [providerLoading, setProviderLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null);
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);

  // Load providers from agent's workspace
  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      setProviderLoading(true);
      try {
        const refetchResult = await handle.refresh();
        const agentData = refetchResult?.agent ?? handle.current() ?? agent;
        const workspaceId = agentData?.workspaceId ?? agent.workspaceId;
        let projectDirectory: string | undefined;
        if (workspaceDirectory) {
          projectDirectory = workspaceDirectory;
        } else if (workspaceId) {
          const workspace = paseo.workspaces.ref(workspaceId);
          const wsData = await workspace.current();
          if (!wsData) {
            const refreshed = await workspace.refresh();
            projectDirectory = refreshed?.workspaceDirectory;
          } else {
            projectDirectory = wsData.workspaceDirectory;
          }
        }
        if (!projectDirectory) {
          projectDirectory = agentData?.cwd;
        }
        if (!projectDirectory) return;
        const nextSnapshot = await paseo.providers.waitForReady({
          cwd: projectDirectory,
          timeoutMs: PROVIDER_READY_TIMEOUT_MS,
        });
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setSelection((current) => {
          if (current) return current;
          return selectionFromAgent(nextSnapshot, agentData);
        });
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setError(message);
      } finally {
        if (!cancelled) setProviderLoading(false);
      }
    };
    loadProviders();
    return () => {
      cancelled = true;
    };
  }, [agent, handle, paseo, workspaceDirectory]);

  const currentProvider = providerById(snapshot, selection?.providerId ?? "");
  const modes = currentProvider?.modes ?? [];

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await handle.timeline.refetch({ direction: "tail", projection: "projected", limit: 200 });
      setEntries(page.entries);
      setMessages(timelineMessages(page.entries));
      setError(page.error);
      const agentSnapshot = (page as { agent?: { status?: string; currentModeId?: string | null } | null }).agent;
      if (agentSnapshot?.status) {
        setLiveStatus(agentSnapshot.status as typeof liveStatus);
        setSelection((current) => {
          if (!current || !("currentModeId" in agentSnapshot)) return current;
          const nextModeId = typeof agentSnapshot.currentModeId === "string" ? agentSnapshot.currentModeId : current.modeId;
          if (nextModeId === current.modeId) return current;
          const mode = currentProvider?.modes?.find((item) => item.id === nextModeId);
          return {
            ...current,
            modeId: nextModeId,
            modeLabel: mode?.label ?? mode?.id ?? nextModeId,
          };
        });
      } else if (handle.status) {
        setLiveStatus(handle.status);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [currentProvider, handle]);

  const isAgentRunning = liveStatus === "running";

  const handleCancel = useCallback(async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      const client = paseo as unknown as { cancelAgent: (agentId: string) => Promise<void> };
      if (typeof client.cancelAgent === "function") {
        await client.cancelAgent(agent.id);
      }
      setTimeout(() => void refresh(), 250);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
    } finally {
      setIsCancelling(false);
    }
  }, [paseo, agent.id, isCancelling, refresh]);

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
    setMessages([]);
    setEntries([]);
    setLoading(true);
    void refresh();
    const unsubscribe = handle.timeline.subscribe(() => void refresh());
    const timer = setInterval(() => void refresh(), agent.status === "running" ? 1200 : 4000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [agent.id, agent.status, handle, refresh]);

  const chatModel = useMemo<ChatModelAdapter>(() => ({
    async run(options) {
      const text = submittedText(options);
      if (!text) return { content: [] };
      await handle.send(text);
      setLiveStatus("running");
      setTimeout(() => void refresh(), 250);
      return { content: [] };
    },
  }), [handle, refresh]);
  const runtime = useLocalRuntime(chatModel, { initialMessages: messages });

  useEffect(() => {
    runtime.thread.reset(messages);
  }, [messages, runtime]);

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
  }), [colors, composerStyles]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
        <ThreadPrimitive.Root style={{ flex: 1 }}>
          <AgentConversationTimeline entries={entries} theme={theme} />
          <SharedComposerInput
            selection={selection}
            snapshot={snapshot}
            providerLoading={providerLoading}
            openMenu={openMenu}
            onToggleMenu={setOpenMenu}
            onSelectModel={(id) => {
              const separator = id.indexOf("::");
              const providerId = separator >= 0 ? id.slice(0, separator) : selection?.providerId ?? "";
              const modelId = separator >= 0 ? id.slice(separator + 2) : id;
              const entry = providerById(snapshot, providerId);
              const modelItem = selectableModels(entry).find((item) => item.id === modelId) ?? null;
              if (entry && modelItem) {
                setSelection(buildSelection(entry, modelItem));
              }
              setOpenMenu(null);
            }}
            onSelectMode={(id) => {
              const mode = modes.find((item) => item.id === id);
              setSelection((current) =>
                current
                  ? {
                      ...current,
                      modeId: id,
                      modeLabel: mode?.label ?? mode?.id ?? id,
                    }
                  : current,
              );
              setOpenMenu(null);
            }}
            onSelectThinking={(id) => {
              setSelection((current) =>
                current
                  ? {
                      ...current,
                      thinkingOptionId: id,
                      thinkingLabel:
                        selectableModels(currentProvider)
                          .find((item) => item.id === current.modelId)
                          ?.thinkingOptions?.find((option) => option.id === id)?.label ?? id,
                    }
                  : current,
              );
              setOpenMenu(null);
            }}
            isAgentRunning={isAgentRunning}
            isCancelling={isCancelling}
            onCancel={handleCancel}
            placeholder="继续跟进这个 Agent…"
            theme={theme}
            autoFocus
          />
        </ThreadPrimitive.Root>
      </ResizeHandle>
    </AssistantRuntimeProvider>
  );
}
