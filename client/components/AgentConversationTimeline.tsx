import React, { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { PaseoTimelineItem } from "./PaseoTimelineItem";
import { PaseoToolCallGroup } from "./PaseoToolCallGroup";

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

export function AgentConversationTimeline({ entries, theme }: { entries: AgentTimelineEntry[]; theme: PluginSurfaceProps["theme"] }) {
  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(timer);
  }, [entries.length]);
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 8, paddingBottom: 20 }}>
      <View>
        {timelineBlocks(entries).map((block) => block.kind === "tools"
          ? <PaseoToolCallGroup key={`tools-${block.entries[0]?.seqStart}`} entries={block.entries} theme={theme} />
          : <PaseoTimelineItem key={`${block.entry.seqStart}:${block.entry.item.type}`} entry={block.entry} theme={theme} />)}
      </View>
    </ScrollView>
  );
}
