import { type PluginSurfaceProps, usePaseo, useRpc } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, type LayoutChangeEvent, type ViewStyle, type TextStyle } from "react-native";

import { TooltipProvider, useTooltip } from "./components/Tooltip";
import { ProjectCard } from "./components/ProjectCard";
import { WorkspaceCreatorPanel } from "./components/WorkspaceCreatorPanel";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { useFilter, TIME_RANGES, type TimeRange } from "./hooks/useFilter";
import { type AgentEntry, type TooltipState, type WorkspaceEntry } from "./overview.types";
import { projectIconRpc } from "./shared/project-icon";
import { gitBranchesRpc } from "./shared/git-branches";
import { autoCommitStartRpc, autoCommitStatusRpc } from "./shared/auto-commit";
import { AgentConversationPreview } from "./components/AgentConversationPreview";

function resolveProjectSourceDirectory(workspaces: WorkspaceEntry[]): string | undefined {
  return (
    workspaces.find((workspace) => workspace.workspaceKind !== "worktree")?.workspaceDirectory ??
    workspaces[0]?.workspaceDirectory
  );
}

function resolveProjectBranchFallbacks(workspaces: WorkspaceEntry[]) {
  const branches = new Set<string>();
  for (const workspace of workspaces) {
    const branch = workspace.gitRuntime?.currentBranch?.trim();
    if (branch) branches.add(branch);
  }
  return Array.from(branches).map((branch) => ({
    id: branch,
    label: branch,
    detail: "当前 Workspace 分支",
  }));
}

type AutoCommitState =
  | { kind: "idle" }
  | { kind: "preparing"; message: string }
  | { kind: "running"; taskId: string; message: string }
  | { kind: "done"; taskId: string; message: string }
  | { kind: "error"; message: string; taskId?: string };

export function WorkspaceOverview({ theme, host, layout, navigation }: PluginSurfaceProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({});
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [createDialog, setCreateDialog] = useState<{
    projectId: string;
    projectDisplayName: string;
    projectDirectory: string;
  } | null>(null);
  const surfaceRef = useRef<View | null>(null);
  const surfaceOrigin = useRef({ x: 0, y: 0 });

  const paseo = usePaseo();
  const { projects, agentsByWorkspace, isLoading, error, refetch } = useWorkspaces(host.id);

  const { filteredProjects, filteredAgentsByWorkspace, autoExpand } = useFilter(
    projects,
    agentsByWorkspace,
    timeRange,
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

  const createProjectOptionsWithoutIcons = useMemo(
    () =>
      projects
        .map((project) => {
          const projectDirectory = resolveProjectSourceDirectory(project.workspaces);
          if (!projectDirectory) return null;
          return {
            projectId: project.projectId,
            projectDisplayName: project.projectDisplayName,
            projectDirectory,
            branches: resolveProjectBranchFallbacks(project.workspaces),
            defaultBranch: resolveProjectBranchFallbacks(project.workspaces)[0]?.id ?? null,
          };
        })
        .filter((project): project is NonNullable<typeof project> => project !== null),
    [projects],
  );
  const getProjectIcon = useRpc(projectIconRpc);
  const getGitBranches = useRpc(gitBranchesRpc);
  const startAutoCommit = useRpc(autoCommitStartRpc);
  const getAutoCommitStatus = useRpc(autoCommitStatusRpc);
  const [autoCommitPending, setAutoCommitPending] = useState(false);
  const [autoCommitState, setAutoCommitState] = useState<AutoCommitState>({ kind: "idle" });
  const [autoCommitCopied, setAutoCommitCopied] = useState(false);
  const { data: projectIcons = new Map<string, string | null>() } = useQuery({
    queryKey: ["workspace-overview-project-icons", host.id, createProjectOptionsWithoutIcons.map((item) => item.projectId)],
    queryFn: async () => {
      const entries = await Promise.all(
        createProjectOptionsWithoutIcons.map(async (project) => [
          project.projectId,
          (await getProjectIcon({
            projectId: project.projectId,
            projectDirectory: project.projectDirectory,
          })).dataUri,
        ] as const),
      );
      return new Map(entries);
    },
    enabled: createProjectOptionsWithoutIcons.length > 0,
    staleTime: 60_000,
  });
  const { data: projectBranches = new Map<string, Awaited<ReturnType<typeof getGitBranches>>>() } = useQuery({
    queryKey: ["workspace-overview-git-branches", host.id, createProjectOptionsWithoutIcons.map((item) => item.projectDirectory)],
    queryFn: async () => {
      const entries = await Promise.all(
        createProjectOptionsWithoutIcons.map(async (project) => [
          project.projectId,
          await getGitBranches({ projectDirectory: project.projectDirectory }),
        ] as const),
      );
      return new Map(entries);
    },
    enabled: createProjectOptionsWithoutIcons.length > 0,
    staleTime: 10_000,
  });
  const createProjectOptions = useMemo(
    () =>
      createProjectOptionsWithoutIcons.map((project) => ({
        ...project,
        branches: projectBranches.get(project.projectId)?.branches ?? project.branches,
        defaultBranch: projectBranches.get(project.projectId)?.defaultBranch ?? project.defaultBranch,
        projectIconDataUri: projectIcons.get(project.projectId) ?? null,
      })),
    [createProjectOptionsWithoutIcons, projectBranches, projectIcons],
  );

  const handleOpenDirectory = useCallback((directory: string) => {
    void paseo.workspaces.open(directory);
  }, [paseo]);

  const handleCreateWorktree = useCallback(
    (projectId: string, projectDisplayName: string, projectDirectory: string) => {
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

  useEffect(() => {
    if (autoCommitState.kind !== "error") return;
    setAutoCommitCopied(false);
    const timer = setTimeout(() => setAutoCommitState({ kind: "idle" }), 8000);
    return () => clearTimeout(timer);
  }, [autoCommitState]);

  const handleAutoCommit = useCallback(async () => {
    if (autoCommitPending) return;
    setAutoCommitPending(true);
    setAutoCommitCopied(false);
    setAutoCommitState({ kind: "preparing", message: "正在启动 Pi 独立进程" });

    try {
      const { taskId } = await startAutoCommit({});
      setAutoCommitState({ kind: "running", taskId, message: "Pi 已启动，正在提交" });

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const status = await getAutoCommitStatus({ taskId });
        const message = status.output.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "Pi 正在运行";
        if (status.status === "running") {
          setAutoCommitState({ kind: "running", taskId, message });
          continue;
        }
        if (status.status === "done") {
          setAutoCommitState({ kind: "done", taskId, message: message || "Pi 已完成提交" });
          void refetch();
          return;
        }
        setAutoCommitState({
          kind: "error",
          taskId,
          message: [status.error, status.output].filter(Boolean).join("\n").trim() || "Pi 提交失败",
        });
        return;
      }
    } catch (error) {
      setAutoCommitState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setAutoCommitPending(false);
    }
  }, [autoCommitPending, getAutoCommitStatus, refetch, startAutoCommit]);

  const handleCopyAutoCommitError = useCallback(() => {
    if (autoCommitState.kind !== "error") return;
    const clipboard = typeof navigator !== "undefined"
      ? (navigator as { clipboard?: { writeText(t: string): Promise<void> } }).clipboard
      : null;
    if (clipboard) {
      void clipboard.writeText(autoCommitState.message);
    }
    setAutoCommitCopied(true);
  }, [autoCommitState]);

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

  const totalWorkspaces = filteredProjects.reduce((sum, p) => sum + p.workspaces.length, 0);
  const totalAgents = filteredProjects.reduce((sum, p) =>
    sum + p.workspaces.reduce((s, ws) => s + (filteredAgentsByWorkspace.get(ws.id)?.length ?? 0), 0),
  0);
  const horizontalPadding = layout.compact ? 12 : 20;

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
  const autoCommitColor =
    autoCommitState.kind === "error"
      ? statusDanger
      : autoCommitState.kind === "done"
        ? "#22c55e"
        : autoCommitState.kind === "running" || autoCommitState.kind === "preparing"
          ? theme.colors.accent
          : theme.colors.foregroundMuted;
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
        <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const }}>
            <Text style={{ color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "700" as const }}>
              所有项目
            </Text>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 8 }}>
              <TouchableOpacity
                onPress={() => void handleAutoCommit()}
                disabled={autoCommitPending}
                activeOpacity={0.75}
                style={{
                  width: 28,
                  height: 24,
                  borderRadius: 6,
                  alignItems: "center" as const,
                  justifyContent: "center" as const,
                  borderWidth: 1,
                  borderColor: autoCommitState.kind === "error" ? statusDanger + "88" : theme.colors.foregroundMuted + "22",
                  backgroundColor: autoCommitPending ? theme.colors.accent + "18" : "transparent",
                  opacity: autoCommitPending ? 0.72 : 1,
                }}
              >
                <Icon name={autoCommitPending ? "LoaderCircle" : "GitCommitHorizontal"} size={15} color={autoCommitState.kind === "error" ? statusDanger : theme.colors.foregroundMuted} />
              </TouchableOpacity>
              <View
                style={{
                  flexDirection: "row" as const,
                  borderRadius: 6,
                  overflow: "hidden" as const,
                  borderWidth: 1,
                  borderColor: theme.colors.foregroundMuted + "22",
                }}
              >
                {TIME_RANGES.map((r) => {
                  const active = timeRange === r.key;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      onPress={() => setTimeRange(r.key)}
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        backgroundColor: active ? theme.colors.accent + "22" : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.accent : theme.colors.foregroundMuted,
                          fontSize: 11,
                          fontWeight: active ? "600" as const : "400" as const,
                        }}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>
            {host.label} · {filteredProjects.length} 个项目 · {totalWorkspaces} 个分支 · {totalAgents} 个 agent
          </Text>
          {autoCommitState.kind !== "idle" && autoCommitState.kind !== "error" ? (
            <TouchableOpacity
              disabled
              activeOpacity={0.75}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                maxWidth: "100%",
                minHeight: 28,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: autoCommitColor + "66",
                backgroundColor: autoCommitColor + "14",
                flexDirection: "row" as const,
                alignItems: "center" as const,
              }}
            >
              <Icon
                name={autoCommitState.kind === "done" ? "CheckCircle2" : "LoaderCircle"}
                size={13}
                color={autoCommitColor}
              />
              <Text
                numberOfLines={2}
                style={{ color: autoCommitColor, fontSize: 11, marginLeft: 6, maxWidth: layout.compact ? 260 : 520 }}
              >
                {autoCommitState.kind === "running"
                  ? `一键提交：${autoCommitState.message}`
                  : autoCommitState.kind === "done"
                    ? `一键提交完成：${autoCommitState.message}`
                    : `一键提交：${autoCommitState.message}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
        {filteredProjects.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 24 }}>
            <Text style={{ color: theme.colors.foregroundMuted, textAlign: "center" as const }}>
              {timeRange === "all" ? "No projects found." : "没有活跃会话。"}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: 24, paddingTop: 4 }}
          >
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
                filteredProjects.map((project) => {
                  const projectDirectory = resolveProjectSourceDirectory(project.workspaces);
                  return (
                    <ProjectCard
                      key={project.projectId}
                      projectId={project.projectId}
                      projectDisplayName={project.projectDisplayName}
                      workspaces={project.workspaces}
                      agentsByWorkspace={filteredAgentsByWorkspace}
                      expanded={{ ...autoExpand, ...expanded }}
                      cardExpanded={{ ...autoExpand, ...cardExpanded }}
                      onToggleCard={handleToggleCard}
                      onToggleBranch={handleToggleBranch}
                      onOpenDirectory={handleOpenDirectory}
                      theme={theme}
                      compact={layout.compact}
                      width={cardWidth}
                      hostLabel={host.label}
                      hostId={host.id}
                      onSelectAgent={(agent) => setSelectedAgentId(agent.id)}
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
          </ScrollView>
        )}
        </View>
        {selectedAgent ? (
          <AgentConversationPreview
            key={selectedAgent.id}
            agent={selectedAgent}
            workspaceDirectory={selectedAgentWorkspaceDirectory}
            paseo={paseo}
            theme={theme}
            onClose={() => setSelectedAgentId(null)}
            onOpenFull={() => navigation!.openAgent({ agentId: selectedAgent.id })}
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
        {autoCommitState.kind === "error" ? (
          <View
            style={{
              position: "absolute" as const,
              top: 12,
              right: horizontalPadding,
              width: Math.min(surfaceSize.width > 0 ? surfaceSize.width - horizontalPadding * 2 : 360, 420),
              maxWidth: "100%",
              paddingHorizontal: 10,
              paddingVertical: 9,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: statusDanger + "66",
              backgroundColor: theme.colors.surface0,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 20,
              zIndex: 10000,
            }}
          >
            <View style={{ flexDirection: "row" as const, alignItems: "flex-start" as const }}>
              <Icon name="TriangleAlert" size={14} color={statusDanger} />
              <Text style={{ color: statusDanger, fontSize: 12, fontWeight: "600" as const, marginLeft: 7, flex: 1 }}>
                一键提交失败
              </Text>
              <TouchableOpacity onPress={() => setAutoCommitState({ kind: "idle" })} style={{ padding: 2 }}>
                <Icon name="X" size={13} color={theme.colors.foregroundMuted} />
              </TouchableOpacity>
            </View>
            <Text selectable numberOfLines={4} style={{ color: theme.colors.foreground, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
              {autoCommitState.message}
            </Text>
            <View style={{ flexDirection: "row" as const, justifyContent: "flex-end" as const, marginTop: 8 }}>
              <TouchableOpacity
                onPress={handleCopyAutoCommitError}
                activeOpacity={0.75}
                style={{
                  minHeight: 24,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.foregroundMuted + "2f",
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                }}
              >
                <Icon name={autoCommitCopied ? "Check" : "Copy"} size={12} color={theme.colors.foregroundMuted} />
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, marginLeft: 5 }}>
                  {autoCommitCopied ? "已复制" : "复制错误"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        </View>

        {createDialog && (
          <WorkspaceCreatorPanel
            key={createDialog.projectId}
            projectId={createDialog.projectId}
            projectDisplayName={createDialog.projectDisplayName}
            projectDirectory={createDialog.projectDirectory}
            hostLabel={host.label}
            hostId={host.id}
            navigation={navigation!}
            projects={createProjectOptions}
            paseo={paseo}
            onClose={() => setCreateDialog(null)}
            onCreate={() => void refetch()}
            theme={theme}
          />
        )}
      </View>
    </TooltipProvider>
  );
}
