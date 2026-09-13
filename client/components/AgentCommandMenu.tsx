import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export interface AgentSlashCommand {
  name: string;
  description: string;
  argumentHint: string;
  kind?: "command" | "skill";
}

export function AgentCommandMenu({ commands, query, loading, error, theme, onSelect }: {
  commands: AgentSlashCommand[];
  query: string;
  loading: boolean;
  error: string | null;
  theme: PluginSurfaceProps["theme"];
  onSelect: (command: AgentSlashCommand) => void;
}) {
  const normalized = query.trim().toLowerCase();
  const matches = commands.filter((command) => command.name.toLowerCase().includes(normalized)).slice(0, 12);
  return <View style={{ maxHeight: 260, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.surface1, overflow: "hidden" }}>
    {loading ? <View style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="small" color={theme.colors.foregroundMuted} /></View> : null}
    {!loading && error ? <Text style={{ padding: 12, color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text> : null}
    {!loading && !error && matches.length === 0 ? <Text style={{ padding: 12, color: theme.colors.foregroundMuted, fontSize: 12 }}>没有匹配的命令</Text> : null}
    {!loading && !error ? <ScrollView keyboardShouldPersistTaps="handled">
      {matches.map((command) => <Pressable
        key={`${command.kind ?? "command"}:${command.name}`}
        accessibilityRole="button"
        accessibilityLabel={`选择命令 /${command.name}`}
        onPress={() => onSelect(command)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => ({ paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", gap: 10, backgroundColor: hovered || pressed ? theme.colors.surface2 : theme.colors.surface1 })}
      >
        <Icon name={command.kind === "skill" ? "Sparkles" : "Terminal"} size={14} color={theme.colors.foregroundMuted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>/{command.name}</Text>
            {command.argumentHint ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{command.argumentHint}</Text> : null}
          </View>
          {command.description ? <Text numberOfLines={2} style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>{command.description}</Text> : null}
        </View>
      </Pressable>)}
    </ScrollView> : null}
  </View>;
}
