import React, { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { PaseoTimelineItem } from "./PaseoTimelineItem";
import { PaseoToolCallGroup } from "./PaseoToolCallGroup";
import { AgentPermissionCard } from "./AgentQuestionCard";
import type { AgentPermissionRequest, AgentPermissionResponse } from "@getpaseo/protocol/agent-types";

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

export function AgentConversationTimeline({ entries, pendingPermissions, respondingRequestId, onRespond, theme, compact }: {
  entries: AgentTimelineEntry[];
  pendingPermissions: AgentPermissionRequest[];
  respondingRequestId: string | null;
  onRespond: (requestId: string, response: AgentPermissionResponse) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(timer);
  }, [entries.length, pendingPermissions.length]);
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 }}>
      <View>
        {timelineBlocks(entries).map((block) => block.kind === "tools"
          ? <PaseoToolCallGroup key={`tools-${block.entries[0]?.seqStart}`} entries={block.entries} theme={theme} />
          : <PaseoTimelineItem key={`${block.entry.seqStart}:${block.entry.item.type}`} entry={block.entry} theme={theme} />)}
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
      </View>
    </ScrollView>
  );
}
