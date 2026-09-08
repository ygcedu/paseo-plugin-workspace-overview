import React, { useMemo } from "react";
import { Text, TouchableOpacity, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";

export function WorkspaceAgentRow({
  agent,
  theme,
  compact,
  navigation,
}: {
  agent: {
    id: string;
    title: string | null;
    provider: string;
    model: string | null;
    status: string;
    requiresAttention?: boolean;
  };
  theme: PluginWorkspacePanelProps["theme"];
  compact: boolean;
  navigation: NonNullable<PluginWorkspacePanelProps["navigation"]>;
}) {
  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "flex-start" as const,
          padding: compact ? 8 : 10,
          borderRadius: 6,
          marginBottom: 4,
          backgroundColor: agent.requiresAttention ? theme.colors.statusDanger + "20" : theme.colors.surface0,
        } as ViewStyle,
        dot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor:
            agent.status === "running"
              ? theme.colors.accent
              : agent.status === "idle"
                ? theme.colors.foregroundMuted
                : theme.colors.statusDanger,
          marginTop: 5,
          marginRight: 8,
          flexShrink: 0,
        } as ViewStyle,
        info: { flex: 1 } as ViewStyle,
        title: { color: theme.colors.foreground, fontSize: compact ? 13 : 14, fontWeight: "500" as const } as TextStyle,
        meta: { color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 2 } as TextStyle,
        provider: { color: theme.colors.foregroundMuted, fontSize: 10, marginTop: 1 } as TextStyle,
      }),
    [theme, compact, agent.requiresAttention, agent.status],
  );

  return (
    <TouchableOpacity onPress={() => navigation.openAgent({ agentId: agent.id })} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {agent.title ?? agent.id.slice(0, 8)}
          </Text>
          <Text style={styles.meta}>{agent.status}</Text>
          <Text style={styles.provider}>
            {agent.provider}
            {agent.model ? ` · ${agent.model}` : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
