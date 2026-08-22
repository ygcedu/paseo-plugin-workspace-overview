import React, { useMemo } from "react";
import { Text, TouchableOpacity, View, type ViewStyle, type TextStyle } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin";
import { type WorkspaceEntry, type AgentEntry, KIND_LABEL } from "../overview.types";
import { ChevronIcon } from "./ChevronIcon";
import { BadgeWithTooltip, statusColor } from "./Tooltip";

export function BranchRow({
  workspace,
  agents,
  expanded,
  onToggle,
  onOpenDirectory,
  theme,
  compact,
  hostLabel,
}: {
  workspace: WorkspaceEntry;
  agents: AgentEntry[];
  expanded: boolean;
  onToggle: () => void;
  onOpenDirectory?: () => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  hostLabel: string;
}) {
  const branchLabel = useMemo(() => {
    const b = workspace.gitRuntime?.currentBranch;
    if (b) return b.replace(/^heads\//, "");
    return workspace.name;
  }, [workspace.gitRuntime?.currentBranch, workspace.name]);

  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 12,
          paddingVertical: 8,
        } as ViewStyle,
        chevron: {
          width: 16,
          marginRight: 4,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        } as ViewStyle,
        name: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "500" as const,
          flex: 1,
        } as TextStyle,
      }),
    [theme],
  );

  // Compose tooltip content as key/value rows.
  const tooltipLines = useMemo(() => {
    const lines: Array<{ key: string; value: string }> = [
      { key: "Kind", value: KIND_LABEL[workspace.workspaceKind] ?? workspace.workspaceKind },
      { key: "Branch", value: branchLabel },
      { key: "Directory", value: workspace.workspaceDirectory },
      { key: "Host", value: hostLabel },
      { key: "Status", value: workspace.status },
    ];
    if (workspace.statusEnteredAt) {
      lines.push({ key: "Since", value: new Date(workspace.statusEnteredAt).toLocaleString() });
    }
    if (agents.length > 0) {
      lines.push({ key: "Agents", value: String(agents.length) });
    }
    return lines;
  }, [workspace, branchLabel, hostLabel, agents.length]);

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.chevron}>
          <ChevronIcon expanded={expanded} color={theme.colors.foregroundMuted} size={10} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {branchLabel}
        </Text>
        <BadgeWithTooltip
          label={KIND_LABEL[workspace.workspaceKind] ?? workspace.workspaceKind}
          tooltipLines={tooltipLines}
          theme={theme}
          color={statusColor(workspace.status, theme)}
          pulsing={
            workspace.status === "running" ||
            workspace.status === "needs_input" ||
            workspace.status === "initializing"
          }
          onPress={onOpenDirectory}
        />
      </View>
    </TouchableOpacity>
  );
}
