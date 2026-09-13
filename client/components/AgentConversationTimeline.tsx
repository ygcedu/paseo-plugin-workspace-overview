import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { PaseoTimelineItem } from "./PaseoTimelineItem";
import { PaseoToolCallGroup } from "./PaseoToolCallGroup";
import { AgentPermissionCard } from "./AgentQuestionCard";
import type { AgentCapabilityFlags, AgentPermissionRequest, AgentPermissionResponse } from "@getpaseo/protocol/agent-types";

type TimelineBlock =
  | { kind: "entry"; entry: AgentTimelineEntry }
  | { kind: "tools"; entries: AgentTimelineEntry[] };

function timelineBlocks(entries: AgentTimelineEntry[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let tools: AgentTimelineEntry[] = [];
  const flushTools = () => {
    if (tools.length) blocks.push({ kind: "tools", entries: tools });
    tools = [];
  };
  for (const entry of entries) {
    const name = String(entry.item.name ?? "").toLowerCase();
    const groupable = entry.item.type === "tool_call" && name !== "speak" && entry.item.detail?.type !== "plan";
    if (groupable) tools.push(entry);
    else { flushTools(); blocks.push({ kind: "entry", entry }); }
  }
  flushTools();
  return blocks;
}

function assistantTiming(entries: AgentTimelineEntry[], entry: AgentTimelineEntry): { durationMs?: number; completedAt?: string } {
  if (entry.item.type !== "assistant_message") return {};
  const index = entries.findIndex((candidate) => candidate.seqStart === entry.seqStart);
  if (index < 0) return {};
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = entries[cursor];
    if (entry.turnId && candidate.turnId && candidate.turnId !== entry.turnId) continue;
    if (candidate.item.type !== "user_message") continue;
    const startedAt = Date.parse(candidate.timestamp);
    const completedAt = Date.parse(entry.timestamp);
    if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return {};
    return { durationMs: Math.max(0, completedAt - startedAt), completedAt: entry.timestamp };
  }
  return {};
}

function RunningTurnIndicator({ startedAt, color }: { startedAt: string | null; color: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : null;
  return <View accessibilityLabel={elapsedSeconds == null ? "Agent 正在工作" : `Agent 已工作 ${elapsedSeconds} 秒`} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32, marginTop: 8 }}>
    <ActivityIndicator size="small" color={color} />
    {elapsedSeconds != null ? <Text style={{ color, fontSize: 11 }}>Working for {elapsedSeconds}s</Text> : null}
  </View>;
}

export function AgentConversationTimeline({ entries, hasOlder, loadingOlder, onLoadOlder, scrollToEndVersion, isRunning, activeTurnStartedAt, pendingPermissions, respondingRequestId, onRespond, rewindCapabilities, rewindingMessageId, onRewind, theme, compact }: {
  entries: AgentTimelineEntry[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  scrollToEndVersion: number;
  isRunning: boolean;
  activeTurnStartedAt: string | null;
  pendingPermissions: AgentPermissionRequest[];
  respondingRequestId: string | null;
  onRespond: (requestId: string, response: AgentPermissionResponse) => void;
  rewindCapabilities?: AgentCapabilityFlags | null;
  rewindingMessageId: string | null;
  onRewind: (messageId: string, text: string, mode: "conversation" | "files" | "both") => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(timer);
  }, [pendingPermissions.length, scrollToEndVersion]);
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 }}>
      <View>
        {hasOlder ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="加载更早消息"
          disabled={loadingOlder}
          onPress={onLoadOlder}
          style={{ alignSelf: "center", minHeight: 32, paddingHorizontal: 12, marginBottom: 12, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", opacity: loadingOlder ? 0.65 : 1 }}
        >
          {loadingOlder ? <ActivityIndicator size="small" color={theme.colors.foregroundMuted} /> : <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>加载更早消息</Text>}
        </Pressable> : null}
        {timelineBlocks(entries).map((block) => block.kind === "tools"
          ? <PaseoToolCallGroup key={`tools-${block.entries[0]?.seqStart}`} entries={block.entries} theme={theme} />
          : <PaseoTimelineItem key={`${block.entry.seqStart}:${block.entry.item.type}`} entry={block.entry} theme={theme} rewindCapabilities={rewindCapabilities} rewinding={rewindingMessageId === block.entry.item.messageId} onRewind={onRewind} {...assistantTiming(entries, block.entry)} />)}
        {pendingPermissions.length > 0 ? <View style={{ gap: 8 }}>
          {pendingPermissions.map((request) => (
            <AgentPermissionCard
              key={request.id}
              request={request}
              theme={theme}
              compact={compact}
              responding={respondingRequestId === request.id}
              onRespond={(response) => onRespond(request.id, response)}
            />
          ))}
        </View> : null}
        {isRunning && pendingPermissions.length === 0 ? <RunningTurnIndicator startedAt={activeTurnStartedAt} color={theme.colors.foregroundMuted} /> : null}
      </View>
    </ScrollView>
  );
}
