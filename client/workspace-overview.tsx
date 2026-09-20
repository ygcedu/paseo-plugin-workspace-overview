import { type PluginSurfaceProps, usePaseo, useRpc } from "@getpaseo/plugin/client";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, type LayoutChangeEvent, type ViewStyle, type TextStyle } from "react-native";

import { TooltipProvider, useTooltip } from "./components/Tooltip";
import { ProjectCard } from "./components/ProjectCard";
import { WorkspaceCreatorPanel } from "./components/WorkspaceCreatorPanel";
import { AgentCreatorPanel } from "./components/AgentCreatorPanel";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useFilter, TIME_RANGES, type TimeRange } from "./hooks/useFilter";
import { useAgentActivityHeatmap } from "./hooks/useAgentActivityHeatmap";
import { HeatmapCalendar } from "./components/HeatmapCalendar";
import { type AgentEntry, type TooltipState, type WorkspaceEntry } from "../shared/overview-types";
import { AgentConversationPreview } from "./components/AgentConversationPreview";
import { projectSourceDirectory, useProjectOptions } from "./overview/useProjectOptions";
import { pluginReloadRpc } from "../shared/agent-config";

const PLUGIN_ID = "workspace-overview";

function formatActivityDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function WorkspaceOverview({ theme, host, layout, navigation }: PluginSurfaceProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({});
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeRange | "date">("24h");
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState<{
    projectId: string;
    projectDisplayName: string;
    projectDirectory: string;
  } | null>(null);
  const [agentCreateWorkspace, setAgentCreateWorkspace] = useState<WorkspaceEntry | null>(null);
  const surfaceRef = useRef<View | null>(null);
  const surfaceOrigin = useRef({ x: 0, y: 0 });

  const paseo = usePaseo();
  const { projects, agentsByWorkspace, isLoading, error, refetch } = useWorkspaces(host.id);

  const reloadPlugin = useRpc(pluginReloadRpc);

  const handlePluginReload = useCallback(async () => {
    try {
      await reloadPlugin({ pluginId: PLUGIN_ID });
    } catch (e) {
      console.warn("Failed to reload plugin:", e);
    }
  }, [reloadPlugin]);

  const { filteredProjects, filteredAgentsByWorkspace, autoExpand } = useFilter(
    projects,
    agentsByWorkspace,
    timeRange,
    showArchived,
  );
  const selectedAgent = useMemo(
    () => {
      if (!selectedAgentId) return null;
      for (const agents of agentsByWorkspace.values()) {
        const agent = agents.find((candidate: AgentEntry) => candidate.id === selectedAgentId);
        if (agent) return agent;
      }
      return null;
    },
    [agentsByWorkspace, selectedAgentId],
  );
  const selectedAgentWorkspaceDirectory = useMemo(() => {
    if (!selectedAgent?.workspaceId) return undefined;
    for (const project of projects) {
      const workspace = project.workspaces.find((candidate) => candidate.id === selectedAgent.workspaceId);
      if (workspace) return workspace.workspaceDirectory;
    }
    return undefined;
  }, [projects, selectedAgent]);

  const createProjectOptions = useProjectOptions(host.id, projects);

  const handleOpenDirectory = useCallback((directory: string) => {
    void paseo.workspaces.open(directory);
  }, [paseo]);

  const handleCreateWorktree = useCallback(
    (projectId: string, projectDisplayName: string, projectDirectory: string) => {
      setSelectedAgentId(null);
      setAgentCreateWorkspace(null);
      setCreateDialog({ projectId, projectDisplayName, projectDirectory });
    },
    [],
  );

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleToggleBranch = useCallback((workspaceId: string, currentEffective: boolean) => {
    setExpanded((prev) => ({ ...prev, [workspaceId]: !currentEffective }));
  }, []);

  const handleToggleCard = useCallback((projectId: string, currentEffective: boolean) => {
    setCardExpanded((prev) => ({ ...prev, [projectId]: !currentEffective }));
  }, []);

  const { columns, cardWidth } = useMemo(() => {
    if (containerWidth <= 0) return { columns: 1, cardWidth: 0 };
    const CARD_GAP = 16;
    const CARD_TARGET_WIDTH = 360;
    const CARD_MIN_WIDTH = 280;
    let cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_TARGET_WIDTH + CARD_GAP)));
    let w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    while (cols > 1 && w < CARD_MIN_WIDTH) {
      cols -= 1;
      w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    }
    return { columns: cols, cardWidth: w };
  }, [containerWidth]);

  const measureSurface = useCallback(() => {
    surfaceRef.current?.measureInWindow((x, y, width, height) => {
      surfaceOrigin.current = { x, y };
      setSurfaceSize({ width, height });
    });
  }, []);

  const tooltipCtxValue = useMemo(
    () => ({
      show: (state: TooltipState) => setTooltip(state),
      hide: () => setTooltip(null),
    }),
    [],
  );

  const workspaceMeta = useMemo(() => {
    const result = new Map<string, { projectId: string; projectDisplayName: string }>();
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        result.set(workspace.id, { projectId: project.projectId, projectDisplayName: project.projectDisplayName });
      }
    }
    return result;
  }, [projects]);
  // Only include agents whose current project/workspace can be represented by the cards below.
  const allAgents = useMemo(() => {
    const result: AgentEntry[] = [];
    for (const [workspaceId, agents] of agentsByWorkspace) {
      if (!workspaceMeta.has(workspaceId)) continue;
      result.push(...agents.map((agent) => agent.workspaceId ? agent : { ...agent, workspaceId }));
    }
    return result;
  }, [agentsByWorkspace, workspaceMeta]);

  const { days: heatmapDays, loading: heatmapLoading, maxCount: heatmapMaxCount, hasData: heatmapHasData } = useAgentActivityHeatmap(paseo, allAgents, theme);
  const selectedActivityAgentIds = useMemo(() => {
    if (!selectedActivityDate) return null;
    const day = heatmapDays.find((candidate) => candidate.date === selectedActivityDate);
    return new Set(day?.agents.map((agent) => agent.id) ?? []);
  }, [heatmapDays, selectedActivityDate]);
  const dateFilteredAgentsByWorkspace = useMemo(() => {
    if (!selectedActivityAgentIds) return filteredAgentsByWorkspace;
    const result = new Map<string, AgentEntry[]>();
    for (const [workspaceId, agents] of agentsByWorkspace) {
      const matching = agents.filter((agent) => selectedActivityAgentIds.has(agent.id));
      if (matching.length > 0) result.set(workspaceId, matching);
    }
    return result;
  }, [agentsByWorkspace, filteredAgentsByWorkspace, selectedActivityAgentIds]);
  const dateFilteredProjects = useMemo(() => {
    if (!selectedActivityAgentIds) return filteredProjects;
    return projects.flatMap((project) => {
      const workspaces = project.workspaces.filter((workspace) => dateFilteredAgentsByWorkspace.has(workspace.id));
      return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
    });
  }, [projects, filteredProjects, dateFilteredAgentsByWorkspace, selectedActivityAgentIds]);
  const isDateFilterActive = activeTimeFilter === "date" && selectedActivityDate !== null;
  const displayedProjects = isDateFilterActive ? dateFilteredProjects : filteredProjects;
  const displayedAgentsByWorkspace = isDateFilterActive ? dateFilteredAgentsByWorkspace : filteredAgentsByWorkspace;
  const displayedAutoExpand = useMemo(() => {
    if (!isDateFilterActive) return autoExpand;
    const result: Record<string, boolean> = {};
    for (const project of dateFilteredProjects) {
      result[project.projectId] = true;
      for (const workspace of project.workspaces) result[workspace.id] = true;
    }
    return result;
  }, [autoExpand, dateFilteredProjects, isDateFilterActive]);
  const totalWorkspaces = displayedProjects.reduce((sum, project) => sum + project.workspaces.length, 0);
  const totalAgents = displayedProjects.reduce((sum, project) =>
    sum + project.workspaces.reduce((workspaceSum, workspace) => workspaceSum + (displayedAgentsByWorkspace.get(workspace.id)?.length ?? 0), 0),
  0);
  const horizontalPadding = layout.compact ? 12 : 20;
  const rightPanelInitialWidth = Math.max(360, Math.round(surfaceSize.width * 0.5));
  const rightPanelMaxWidth = Math.max(800, surfaceSize.width - 280);

  const TOOLTIP_WIDTH = 280;
  const TOOLTIP_EST_HEIGHT = tooltip ? 24 + tooltip.lines.length * 18 : 0;

  const tooltipPos = useMemo(() => {
    if (!tooltip) return null;
    const localX = tooltip.x - surfaceOrigin.current.x;
    const localY = tooltip.y - surfaceOrigin.current.y;
    let left = localX - TOOLTIP_WIDTH;
    let top = localY + 6;
    if (surfaceSize.width > 0) {
      if (left + TOOLTIP_WIDTH > surfaceSize.width - 8) left = surfaceSize.width - TOOLTIP_WIDTH - 8;
      if (left < 8) left = 8;
    }
    if (surfaceSize.height > 0 && top + TOOLTIP_EST_HEIGHT > surfaceSize.height - 8) {
      top = Math.max(8, localY - TOOLTIP_EST_HEIGHT - 6);
    }
    return { left, top };
  }, [tooltip, surfaceSize, TOOLTIP_EST_HEIGHT]);

  const statusDanger = (theme.colors as { statusDanger?: string }).statusDanger ?? "#ef4444";
  const tooltipStyles = useMemo(
    () => ({
      container: {
        position: "absolute" as const,
        width: TOOLTIP_WIDTH,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.colors.foreground,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 12,
        zIndex: 9999,
      } as ViewStyle,
      row: { flexDirection: "row" as const, marginBottom: 4 } as ViewStyle,
      key: { color: theme.colors.surface0, opacity: 0.6, fontSize: 11, width: 72, flexShrink: 0 } as TextStyle,
      value: { color: theme.colors.surface0, fontSize: 11, flex: 1, minWidth: 0, fontWeight: "500" as const } as TextStyle,
    }),
    [theme],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: statusDanger }}>{(error as Error).message}</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.accent }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TooltipProvider value={tooltipCtxValue}>
      <View
        ref={surfaceRef}
        style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
        onLayout={measureSurface}
      >
        <View style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <View style={{ flex: 1, minWidth: 0, display: (createDialog || agentCreateWorkspace) && layout.compact ? "none" : "flex" }}>
        <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 12 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "700" as const }}>
                所有项目
              </Text>
              <TouchableOpacity
                onPress={handlePluginReload}
                activeOpacity={0.7}
                style={{ padding: 4 }}
                accessibilityLabel="重新加载插件"
              >
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 22, fontWeight: "600" }}>⟳</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>
            {host.label} · {displayedProjects.length} 个项目 · {totalWorkspaces} 个分支 · {totalAgents} 个 agent
          </Text>
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, marginTop: 8, gap: 8 }}>
            <View
              style={{
                flexDirection: "row" as const,
                borderRadius: 6,
                overflow: "hidden" as const,
                borderWidth: 1,
                borderColor: theme.colors.foregroundMuted + "22",
              }}
            >
              {selectedActivityDate ? (
                <TouchableOpacity
                  onPress={() => setActiveTimeFilter("date")}
                  style={{ paddingHorizontal: 7, paddingVertical: 3, backgroundColor: isDateFilterActive ? theme.colors.accent + "22" : "transparent" }}
                >
                  <Text style={{ color: isDateFilterActive ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 11, fontWeight: isDateFilterActive ? "600" : "400" }}>
                    {formatActivityDate(selectedActivityDate)}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {TIME_RANGES.map((r) => {
                const active = activeTimeFilter === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => {
                      setTimeRange(r.key);
                      setActiveTimeFilter(r.key);
                    }}
                    style={{ paddingHorizontal: 7, paddingVertical: 3, backgroundColor: active ? theme.colors.accent + "22" : "transparent" }}
                  >
                    <Text style={{ color: active ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 11, fontWeight: active ? "600" as const : "400" as const }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View
              style={{
                flexDirection: "row" as const,
                borderRadius: 6,
                overflow: "hidden" as const,
                borderWidth: 1,
                borderColor: theme.colors.foregroundMuted + "22",
              }}
            >
              <TouchableOpacity
                onPress={() => setShowArchived(!showArchived)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  backgroundColor: showArchived ? theme.colors.accent + "22" : "transparent",
                }}
              >
                <Text
                  style={{
                    color: showArchived ? theme.colors.accent : theme.colors.foregroundMuted,
                    fontSize: 11,
                    fontWeight: showArchived ? "600" as const : "400" as const,
                  }}
                >
                  {showArchived ? "隐藏归档" : "显示归档"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: 24, paddingTop: 4 }}
          >
          {heatmapLoading ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>加载热度图中…</Text>
            </View>
          ) : !heatmapHasData ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>暂无活动数据，开始使用 Agent 后将在热力图中显示</Text>
            </View>
          ) : (
            <HeatmapCalendar
              days={heatmapDays}
              maxCount={heatmapMaxCount}
              theme={theme}
              selectedDate={selectedActivityDate}
              onSelectDate={(date) => {
                if (selectedActivityDate === date) {
                  setSelectedActivityDate(null);
                  setActiveTimeFilter(timeRange);
                  return;
                }
                setSelectedActivityDate(date);
                setActiveTimeFilter("date");
              }}
              workspaceMeta={workspaceMeta}
            />
          )}
          {displayedProjects.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 24 }}>
              <Text style={{ color: theme.colors.foregroundMuted, textAlign: "center" as const }}>
                {isDateFilterActive && selectedActivityDate ? `${formatActivityDate(selectedActivityDate)}没有 Agent 活动。` : timeRange === "all" ? "No projects found." : "没有活跃会话。"}
              </Text>
            </View>
          ) : (
            <View
              onLayout={handleContainerLayout}
              style={{
                flexDirection: "row" as const,
                flexWrap: "wrap" as const,
                justifyContent: "space-between" as const,
                alignItems: "flex-start" as const,
              }}
            >
              {columns > 0 && cardWidth > 0 &&
                displayedProjects.map((project) => {
                  const projectDirectory = projectSourceDirectory(project.workspaces);
                  return (
                    <ProjectCard
                      key={project.projectId}
                      projectId={project.projectId}
                      projectDisplayName={project.projectDisplayName}
                      workspaces={project.workspaces}
                      agentsByWorkspace={displayedAgentsByWorkspace}
                      expanded={{ ...displayedAutoExpand, ...expanded }}
                      cardExpanded={{ ...displayedAutoExpand, ...cardExpanded }}
                      onToggleCard={handleToggleCard}
                      onToggleBranch={handleToggleBranch}
                      onOpenDirectory={handleOpenDirectory}
                      theme={theme}
                      compact={layout.compact}
                      width={cardWidth}
                      hostLabel={host.label}
                      hostId={host.id}
                      onSelectAgent={(agent) => {
                        if (layout.compact && navigation) {
                          navigation.openAgent({ agentId: agent.id });
                          return;
                        }
                        setCreateDialog(null);
                        setAgentCreateWorkspace(null);
                        setSelectedAgentId(agent.id);
                      }}
                      onCreateAgent={(workspace) => {
                        setSelectedAgentId(null);
                        setCreateDialog(null);
                        setAgentCreateWorkspace(workspace);
                      }}
                      onCreateWorktree={
                        projectDirectory
                          ? () =>
                              handleCreateWorktree(
                                project.projectId,
                                project.projectDisplayName,
                                projectDirectory,
                              )
                          : undefined
                      }
                    />
                  );
                })}
              {columns > 1 &&
                Array.from({ length: columns - 1 }).map((_, i) => (
                  <View key={`spacer-${i}`} style={{ width: cardWidth }} />
                ))}
            </View>
          )}
        </ScrollView>
        </View>
        {selectedAgent && (!layout.compact || !navigation) ? (
          <AgentConversationPreview
            key={selectedAgent.id}
            agent={selectedAgent}
            workspaceDirectory={selectedAgentWorkspaceDirectory}
            paseo={paseo}
            theme={theme}
            onClose={() => setSelectedAgentId(null)}
            onOpenFull={() => navigation?.openAgent({ agentId: selectedAgent.id })}
            initialPanelWidth={rightPanelInitialWidth}
            maxPanelWidth={rightPanelMaxWidth}
            compact={layout.compact}
          />
        ) : null}
        {createDialog ? (
          <WorkspaceCreatorPanel
            key={createDialog.projectId}
            projectId={createDialog.projectId}
            projectDisplayName={createDialog.projectDisplayName}
            projectDirectory={createDialog.projectDirectory}
            hostId={host.id}
            navigation={navigation!}
            projects={createProjectOptions}
            paseo={paseo}
            onClose={() => setCreateDialog(null)}
            onCreate={() => void refetch()}
            theme={theme}
            layout={layout}
            initialPanelWidth={rightPanelInitialWidth}
            maxPanelWidth={rightPanelMaxWidth}
          />
        ) : null}
        {agentCreateWorkspace ? (
          <AgentCreatorPanel
            key={agentCreateWorkspace.id}
            workspace={agentCreateWorkspace}
            paseo={paseo}
            theme={theme}
            compact={layout.compact}
            initialPanelWidth={rightPanelInitialWidth}
            maxPanelWidth={rightPanelMaxWidth}
            onClose={() => setAgentCreateWorkspace(null)}
            onCreated={(agent) => {
              setAgentCreateWorkspace(null);
              void refetch();
              if (layout.compact && navigation) navigation.openAgent({ agentId: agent.id });
              else setSelectedAgentId(agent.id);
            }}
          />
        ) : null}
        </View>

        {tooltip && tooltipPos && (
          <View style={[tooltipStyles.container, { left: tooltipPos.left, top: tooltipPos.top }]} pointerEvents="none">
            {tooltip.lines.map((line, i) => (
              <View key={i} style={[tooltipStyles.row, i === tooltip.lines.length - 1 && { marginBottom: 0 }]}>
                <Text style={tooltipStyles.key}>{line.key}</Text>
                <Text style={tooltipStyles.value}>{line.value}</Text>
              </View>
            ))}
          </View>
        )}
        </View>
      </View>
    </TooltipProvider>
  );
}
