import { type PluginWorkspacePanelProps, usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View, type ViewStyle, type TextStyle } from "react-native";
import { WorkspaceAgentRow } from "./components/WorkspaceAgentRow";

export function WorkspaceAgentsPanel({ theme, layout, workspaceId, navigation }: PluginWorkspacePanelProps) {
  const paseo = usePaseo();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace-agents", workspaceId],
    queryFn: async () => {
      const result = await paseo.agents.list({});
      return result.entries.filter(
        (entry: { agent: { workspaceId?: string } }) => entry.agent.workspaceId === workspaceId,
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
          data={agents.map((entry: { agent: { id: string; title: string | null; provider: string; model: string | null; status: string; requiresAttention?: boolean } }) => entry.agent)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WorkspaceAgentRow agent={item} theme={theme} compact={layout.compact} navigation={navigation!} />
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}
