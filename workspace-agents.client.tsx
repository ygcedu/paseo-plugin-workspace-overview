import { type PluginWorkspacePanelProps, usePaseo } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View, type ViewStyle, type TextStyle } from "react-native";
import { useOpenAgent } from "./hooks/useOpenAgent";

function AgentRow({
  agent,
  theme,
  compact,
  serverId,
}: {
  agent: {
    id: string;
    shortId: string;
    title: string | null;
    provider: string;
    model: string | null;
    status: string;
    lastUserMessageAt: string | null;
    requiresAttention: boolean;
  };
  theme: PluginWorkspacePanelProps["theme"];
  compact: boolean;
  serverId: string;
}) {
  const { openAgent } = useOpenAgent(serverId);
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
    <TouchableOpacity onPress={() => void openAgent(agent.id)} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {agent.title ?? agent.shortId}
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

export function WorkspaceAgentsPanel({ theme, layout, workspaceId, host }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace-agents", workspaceId],
    queryFn: async () => {
      const result = await paseo.agents.list({});
      return result.entries.filter(
        (entry: { agent: { workspaceId: string | undefined } }) => entry.agent.workspaceId === workspaceId,
      );
    },
  });

  const styles = useMemo(
    () =>
      ({
        screen: { flex: 1, backgroundColor: theme.colors.surface0, padding: layout.compact ? 12 : 16 } as ViewStyle,
        header: { marginBottom: 12 } as ViewStyle,
        title: { color: theme.colors.foreground, fontSize: layout.compact ? 16 : 18, fontWeight: "700" as const } as TextStyle,
        empty: { color: theme.colors.foregroundMuted, textAlign: "center" as const, marginTop: 32 } as TextStyle,
        error: { color: theme.colors.statusDanger, textAlign: "center" as const, marginTop: 16 } as TextStyle,
      }),
    [theme, layout.compact],
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading agents…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>{error.message}</Text>
      </View>
    );
  }

  const agents = data ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Workspace Agents</Text>
      </View>
      {agents.length === 0 ? (
        <Text style={styles.empty}>No agents in this workspace.</Text>
      ) : (
        <FlatList
          data={agents.map((entry: { agent: { id: string; shortId: string; title: string | null; provider: string; model: string | null; status: string; requiresAttention: boolean } }) => entry.agent)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AgentRow agent={item} theme={theme} compact={layout.compact} serverId={host.id} />
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}
