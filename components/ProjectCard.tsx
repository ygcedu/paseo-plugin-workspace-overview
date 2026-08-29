import React, { useCallback, useMemo } from "react";
import { Text, TouchableOpacity, View, type ViewStyle, type TextStyle } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin";
import { type WorkspaceEntry, type AgentEntry, type ProjectCardProps } from "../overview.types";
import { ChevronIcon } from "./ChevronIcon";
import { BranchRow } from "./BranchRow";
import { AgentRow } from "./AgentRow";

const CARD_GAP = 16;

/** Decide whether an agent should auto-expand its surroundings on first view. */
function shouldAutoExpandAgent(agent: AgentEntry): boolean {
  return (
    agent.status === "running" ||
    agent.status === "error" ||
    agent.requiresAttention === true
  );
}

export function ProjectCard({
  projectId,
  projectDisplayName,
  workspaces,
  agentsByWorkspace,
  expanded,
  cardExpanded,
  onToggleCard,
  onToggleBranch,
  onOpenDirectory,
  theme,
  compact,
  width,
  hostLabel,
  hostId,
  onCreateWorktree,
}: ProjectCardProps) {
  // Card-level expand: explicit user toggle wins; otherwise auto-expand when
  // any branch contains a running/errored/attention agent.
  // Derive only the agents arrays relevant to this project's workspaces,
  // avoiding a dependency on the entire agentsByWorkspace Map.
  const projectAgentsArrays = useMemo(
    () => workspaces.map((ws) => agentsByWorkspace.get(ws.id) ?? []),
    [workspaces, agentsByWorkspace],
  );

  const cardIsExpanded = useMemo(() => {
    const explicit = cardExpanded[projectId];
    if (explicit !== undefined) return explicit;
    return projectAgentsArrays.some((agents) => agents.some(shouldAutoExpandAgent));
  }, [cardExpanded, projectId, projectAgentsArrays]);

  const toggleCard = useCallback(
    () => onToggleCard(projectId, cardIsExpanded),
    [onToggleCard, projectId, cardIsExpanded],
  );
  const styles = useMemo(
    () =>
      ({
        card: {
          width,
          backgroundColor: theme.colors.surface0,
          borderRadius: 12,
          overflow: "hidden" as const,
          marginBottom: CARD_GAP,
          borderWidth: 1,
          borderColor: theme.colors.foregroundMuted + "33",
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        } as ViewStyle,
        header: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.colors.foregroundMuted + "14",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.foregroundMuted + "26",
        } as ViewStyle,
        headerChevron: {
          width: 16,
          marginRight: 4,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        } as ViewStyle,
        title: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontWeight: "600" as const,
          flex: 1,
        } as TextStyle,
        counter: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          marginLeft: 8,
        } as TextStyle,
        createBtn: {
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          marginLeft: 8,
          borderWidth: 1,
          borderColor: theme.colors.foregroundMuted + "44",
          backgroundColor: theme.colors.foregroundMuted + "11",
        } as ViewStyle,
        createBtnText: {
          color: theme.colors.foregroundMuted,
          fontSize: 18,
          lineHeight: 20,
          fontWeight: "300" as const,
        } as TextStyle,
        body: {
          paddingVertical: 0,
        } as ViewStyle,
        divider: {
          height: 1,
          backgroundColor: theme.colors.foregroundMuted + "14",
          marginLeft: 12,
        } as ViewStyle,
      }),
    [theme, width],
  );

  const totalAgents = useMemo(
    () => workspaces.reduce((sum, ws) => sum + (agentsByWorkspace.get(ws.id)?.length ?? 0), 0),
    [workspaces, agentsByWorkspace],
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={toggleCard} activeOpacity={0.7}>
        <View style={styles.header}>
          <View style={styles.headerChevron}>
            <ChevronIcon expanded={cardIsExpanded} color={theme.colors.foregroundMuted} size={10} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {projectDisplayName}
          </Text>
          <Text style={styles.counter}>
            {workspaces.length} branch{workspaces.length !== 1 ? "es" : ""}
            {totalAgents > 0 ? ` · ${totalAgents} agent${totalAgents !== 1 ? "s" : ""}` : ""}
          </Text>
          {onCreateWorktree ? (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={(event) => {
                event.stopPropagation();
                onCreateWorktree();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.createBtnText}>+</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
      {cardIsExpanded && (
        <View style={styles.body}>
        {workspaces.map((ws, idx) => {
          const wsAgents = agentsByWorkspace.get(ws.id) ?? [];
          // If the user hasn't manually toggled this branch yet (undefined),
          // auto-expand when it contains a running/errored/attention agent.
          const explicit = expanded[ws.id];
          const isExpanded = explicit !== undefined ? explicit : wsAgents.some(shouldAutoExpandAgent);
          return (
            <View key={ws.id}>
              {idx > 0 && <View style={styles.divider} />}
              <BranchRow
                workspace={ws}
                agents={wsAgents}
                expanded={isExpanded}
                onToggle={() => onToggleBranch(ws.id, isExpanded)}
                onOpenDirectory={() => onOpenDirectory(ws.workspaceDirectory)}
                theme={theme}
                compact={compact}
                hostLabel={hostLabel}
              />
              {isExpanded &&
                wsAgents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} theme={theme} compact={compact} hostId={hostId} />
                ))}
              {isExpanded && wsAgents.length === 0 && (
                <View style={{ paddingLeft: 32, paddingRight: 12, paddingVertical: 6 }}>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                    No agents in this branch.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
        </View>
      )}
    </View>
  );
}
