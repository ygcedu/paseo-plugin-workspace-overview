import React, { useMemo } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { PaseoStreamBadge } from "./PaseoStreamBadge";
import { PaseoAssistantMessage } from "./PaseoAssistantMessage";

function toolPresentation(item: AgentTimelineEntry["item"]): { label: string; secondary?: string; detail?: unknown; icon: string } {
  const detail = item.detail as Record<string, unknown> | undefined;
  const detailType = detail?.type;
  const rawName = String(item.name ?? "Tool");
  const secondary = typeof detail?.command === "string" ? detail.command
    : typeof detail?.filePath === "string" ? detail.filePath
      : typeof detail?.query === "string" ? detail.query
        : typeof detail?.url === "string" ? detail.url
          : typeof detail?.branchName === "string" ? detail.branchName
            : typeof detail?.description === "string" ? detail.description
              : typeof detail?.label === "string" ? detail.label
                : typeof detail?.path === "string" ? detail.path : undefined;
  return {
    label: item.name === "thinking" ? "Thinking"
      : detailType === "edit" ? "Edit"
        : detailType === "write" ? "Write"
          : detailType === "shell" ? "Shell"
            : detailType === "read" ? "Read"
              : detailType === "search" ? "Search"
                : detailType === "fetch" ? "Fetch"
                  : detailType === "worktree_setup" ? "Worktree Setup"
                    : detailType === "sub_agent" && typeof detail?.subAgentType === "string" ? detail.subAgentType
                      : detailType === "sub_agent" ? "Task"
                        : detailType === "plan" ? "Plan" : rawName,
    secondary,
    detail: detail ?? item.result ?? item.error,
    icon: item.name === "thinking" ? "Brain"
      : detailType === "edit" || detailType === "write" ? "Pencil"
        : detailType === "shell" ? "SquareTerminal"
          : detailType === "read" ? "Eye"
            : detailType === "search" ? "Search"
              : detailType === "sub_agent" ? "Bot" : "Wrench",
  };
}

export function PaseoTimelineItem({ entry, theme }: { entry: AgentTimelineEntry; theme: PluginSurfaceProps["theme"] }) {
  const item = entry.item;
  const styles = useMemo(() => ({
    userRoot: { flexDirection: "row", justifyContent: "flex-end", marginVertical: 16 } as ViewStyle,
    userBubble: { maxWidth: "100%", backgroundColor: theme.colors.foregroundMuted + "18", borderRadius: 16, borderTopRightRadius: 4, padding: 16 } as ViewStyle,
    userText: { color: theme.colors.foreground, fontSize: 15, lineHeight: 21 } as TextStyle,
    error: { flexDirection: "row", gap: 8, paddingVertical: 10, alignItems: "flex-start" } as ViewStyle,
    errorText: { flex: 1, color: theme.colors.statusDanger, fontSize: 14, lineHeight: 20 } as TextStyle,
    compact: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 } as ViewStyle,
    compactLine: { height: 1, flex: 1, backgroundColor: theme.colors.foregroundMuted + "2a" } as ViewStyle,
    compactText: { color: theme.colors.foregroundMuted, fontSize: 13 } as TextStyle,
  }), [theme]);

  if (item.type === "user_message") return <View style={styles.userRoot}><View style={styles.userBubble}><Text selectable style={styles.userText}>{item.text}</Text></View></View>;
  if (item.type === "assistant_message") return <PaseoAssistantMessage text={item.text} theme={theme} />;
  if (item.type === "reasoning") return <PaseoStreamBadge label="Thinking" icon="Brain" detail={item.text} loading={item.status !== "ready"} theme={theme} />;
  if (item.type === "tool_call") {
    const presentation = toolPresentation(item);
    return <PaseoStreamBadge label={presentation.label} secondaryLabel={presentation.secondary} icon={presentation.icon} detail={presentation.detail} loading={item.status === "running" || item.status === "executing"} error={item.status === "failed"} theme={theme} />;
  }
  if (item.type === "todo") {
    const done = item.items?.filter((todo: { completed?: boolean }) => todo.completed).length ?? 0;
    const total = item.items?.length ?? 0;
    const detail = item.items?.map((todo: { completed?: boolean; text: string }) => `${todo.completed ? "✓" : "○"} ${todo.text}`).join("\n");
    return <PaseoStreamBadge label="Updated tasks" secondaryLabel={`${done}/${total}`} icon="ListChecks" detail={detail} theme={theme} />;
  }
  if (item.type === "error") return <View style={styles.error}><Icon name="CircleX" color={theme.colors.statusDanger} size={16} /><Text selectable style={styles.errorText}>{item.message}</Text></View>;
  if (item.type === "compaction") return <View style={styles.compact}><View style={styles.compactLine} /><Icon name="Scissors" color={theme.colors.foregroundMuted} size={12} /><Text style={styles.compactText}>Context compacted</Text><View style={styles.compactLine} /></View>;
  return null;
}
