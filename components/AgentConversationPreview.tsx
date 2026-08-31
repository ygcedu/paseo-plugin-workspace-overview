import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useAuiState,
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

function ComposerActionButton({
  isAgentRunning,
  isCancelling,
  onCancel,
  sendStyle,
  stopStyle,
  theme,
}: {
  isAgentRunning: boolean;
  isCancelling: boolean;
  onCancel: () => void;
  sendStyle: ViewStyle;
  stopStyle: ViewStyle;
  theme: PluginSurfaceProps["theme"];
}) {
  const composerText = useAuiState((state) => state.composer.text);
  const hasInput = composerText.trim().length > 0;

  if (isAgentRunning && !hasInput) {
    return (
      <Pressable accessibilityLabel={isCancelling ? "正在停止…" : "停止 Agent"} onPress={onCancel} disabled={isCancelling} style={stopStyle}>
        <Icon name={isCancelling ? "Loader" : "Square"} color="#fff" size={14} />
      </Pressable>
    );
  }

  return (
    <ComposerPrimitive.Send style={sendStyle}>
      <Icon name="ArrowUp" color={theme.colors.accentForeground} size={16} />
    </ComposerPrimitive.Send>
  );
}

export function AgentConversationPreview({
  agent,
  paseo,
  theme,
  onClose,
  onOpenFull,
}: {
  agent: AgentEntry;
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

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await handle.timeline.refetch({ direction: "tail", projection: "projected", limit: 200 });
      setEntries(page.entries);
      setMessages(timelineMessages(page.entries));
      setError(page.error);
      const snapshot = (page as { agent?: { status?: string } | null }).agent;
      if (snapshot?.status) {
        setLiveStatus(snapshot.status as typeof liveStatus);
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

  const model = useMemo<ChatModelAdapter>(() => ({
    async run(options) {
      const text = submittedText(options);
      if (!text) return { content: [] };
      await handle.send(text);
      setLiveStatus("running");
      setTimeout(() => void refresh(), 250);
      return { content: [] };
    },
  }), [handle, refresh]);
  const runtime = useLocalRuntime(model, { initialMessages: messages });

  useEffect(() => {
    runtime.thread.reset(messages);
  }, [messages, runtime]);

  const styles = useMemo(() => ({
    panel: { height: "100%", borderLeftWidth: 1, borderLeftColor: theme.colors.foregroundMuted + "22", backgroundColor: theme.colors.surface0 } as ViewStyle,
    header: { height: 54, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.foregroundMuted + "22" } as ViewStyle,
    title: { flex: 1, color: theme.colors.foreground, fontSize: 14, fontWeight: "600" } as TextStyle,
    subtitle: { color: theme.colors.foregroundMuted, fontSize: 11 } as TextStyle,
    iconButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center" } as ViewStyle,
    composer: { margin: 12, borderWidth: 1, borderColor: theme.colors.foregroundMuted + "33", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "flex-end", gap: 8 } as ViewStyle,
    input: { flex: 1, minHeight: 36, maxHeight: 120, color: theme.colors.foreground, fontSize: 13, borderWidth: 0 } as TextStyle,
    send: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent } as ViewStyle,
    stop: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.statusDanger } as ViewStyle,
  }), [theme]);

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
          <Pressable accessibilityLabel="打开完整会话" onPress={onOpenFull} style={styles.iconButton}><Icon name="ExternalLink" color={theme.colors.foregroundMuted} size={16} /></Pressable>
          <Pressable accessibilityLabel="关闭会话预览" onPress={onClose} style={styles.iconButton}><Icon name="X" color={theme.colors.foregroundMuted} size={16} /></Pressable>
        </View>
        {loading ? <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>加载会话中…</Text> : null}
        {error ? <Text style={{ color: theme.colors.statusDanger, padding: 16 }}>{error}</Text> : null}
        <ThreadPrimitive.Root style={{ flex: 1 }}>
          <AgentConversationTimeline entries={entries} theme={theme} />
          <ComposerPrimitive.Root style={styles.composer}>
            <ComposerPrimitive.Input style={styles.input} placeholder="继续跟进这个 Agent…" placeholderTextColor={theme.colors.foregroundMuted} multiline />
            <ComposerActionButton
              isAgentRunning={isAgentRunning}
              isCancelling={isCancelling}
              onCancel={handleCancel}
              sendStyle={styles.send}
              stopStyle={styles.stop}
              theme={theme}
            />
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </ResizeHandle>
    </AssistantRuntimeProvider>
  );
}
