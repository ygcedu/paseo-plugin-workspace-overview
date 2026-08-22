import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
  type TextStyle,
} from "react-native";

const CARD_GAP = 16;
const CARD_TARGET_WIDTH = 360;
const CARD_MIN_WIDTH = 280;

type WorkspaceStatus =
  | "needs_input"
  | "failed"
  | "running"
  | "attention"
  | "done"
  | string;

interface WorkspaceEntry {
  id: string;
  projectId: string;
  projectDisplayName: string;
  name: string;
  status: WorkspaceStatus;
  workspaceKind: "directory" | "local_checkout" | "checkout" | "worktree";
  gitRuntime?: { currentBranch?: string | null } | null;
}

interface AgentEntry {
  id: string;
  workspaceId?: string;
  title: string | null;
  provider: string;
  model: string | null;
  status: "initializing" | "idle" | "running" | "error" | "closed" | string;
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
}

/**
 * Vector-style chevron icon drawn with two rotated View bars.
 * react-native-svg / lucide-react-native are not on the plugin client allow-list,
 * so this is the closest we can get to an SVG-style icon using only RN primitives.
 */
function ChevronIcon({ expanded, color, size = 10 }: { expanded: boolean; color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 7);
  const half = size / 2;
  const bar = size * 0.7;

  if (expanded) {
    // Chevron-down: two bars forming a "∨"
    return (
      <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
        <View
          style={{
            position: "absolute",
            width: bar,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: color,
            transform: [{ translateX: -bar * 0.25 }, { rotate: "45deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            width: bar,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: color,
            transform: [{ translateX: bar * 0.25 }, { rotate: "-45deg" }],
          }}
        />
      </View>
    );
  }
  // Chevron-right: two bars forming a ">"
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateY: -bar * 0.25 }, { rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateY: bar * 0.25 }, { rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

function StatusDot({ status, theme }: { status: string; theme: PluginSurfaceProps["theme"] }) {
  const color =
    status === "running" || status === "needs_input"
      ? theme.colors.accent
      : status === "attention" || status === "failed" || status === "error"
        ? theme.colors.statusDanger
        : theme.colors.foregroundMuted;
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

function AgentRow({ agent, theme, compact }: { agent: AgentEntry; theme: PluginSurfaceProps["theme"]; compact: boolean }) {
  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 16,
          paddingLeft: 36, // indented under branch
          paddingVertical: 6,
          backgroundColor: agent.requiresAttention ? theme.colors.statusDanger + "14" : undefined,
        } as ViewStyle,
        title: {
          color: theme.colors.foreground,
          fontSize: 12,
          flex: 1,
        } as TextStyle,
        meta: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          marginLeft: 8,
        } as TextStyle,
      }),
    [theme, compact, agent.requiresAttention],
  );
  return (
    <View style={styles.row}>
      <StatusDot status={agent.status} theme={theme} />
      <Text style={styles.title} numberOfLines={1}>
        {agent.title ?? agent.id.slice(0, 8)}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {agent.provider}
        {agent.model ? `/${agent.model}` : ""}
      </Text>
    </View>
  );
}

function BranchRow({
  workspace,
  agents,
  expanded,
  onToggle,
  theme,
  compact,
}: {
  workspace: WorkspaceEntry;
  agents: AgentEntry[];
  expanded: boolean;
  onToggle: () => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
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
        kind: {
          color: theme.colors.foregroundMuted,
          fontSize: 10,
          marginLeft: 8,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.foregroundMuted + "14",
        } as TextStyle,
        meta: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          marginLeft: 8,
        } as TextStyle,
      }),
    [theme],
  );

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.chevron}>
          <ChevronIcon expanded={expanded} color={theme.colors.foregroundMuted} size={10} />
        </View>
        <StatusDot status={workspace.status} theme={theme} />
        <Text style={styles.name} numberOfLines={1}>
          {branchLabel}
        </Text>
        {workspace.workspaceKind === "worktree" && <Text style={styles.kind}>worktree</Text>}
        {agents.length > 0 && (
          <Text style={styles.meta}>
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface ProjectCardProps {
  projectId: string;
  projectDisplayName: string;
  workspaces: WorkspaceEntry[];
  agentsByWorkspace: Map<string, AgentEntry[]>;
  expanded: Record<string, boolean>;
  onToggleBranch: (workspaceId: string) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  width: number;
}

function ProjectCard({
  projectDisplayName,
  workspaces,
  agentsByWorkspace,
  expanded,
  onToggleBranch,
  theme,
  compact,
  width,
}: ProjectCardProps) {
  const styles = useMemo(
    () =>
      ({
        card: {
          width,
          backgroundColor: theme.colors.surface0,
          borderRadius: 12,
          overflow: "hidden" as const,
          marginBottom: CARD_GAP,
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
        body: {
          paddingVertical: 4,
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
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {projectDisplayName}
        </Text>
        <Text style={styles.counter}>
          {workspaces.length} branch{workspaces.length !== 1 ? "es" : ""}
          {totalAgents > 0 ? ` · ${totalAgents} agent${totalAgents !== 1 ? "s" : ""}` : ""}
        </Text>
      </View>
      <View style={styles.body}>
        {workspaces.map((ws, idx) => {
          const wsAgents = agentsByWorkspace.get(ws.id) ?? [];
          const isExpanded = expanded[ws.id] ?? false;
          return (
            <View key={ws.id}>
              {idx > 0 && <View style={styles.divider} />}
              <BranchRow
                workspace={ws}
                agents={wsAgents}
                expanded={isExpanded}
                onToggle={() => onToggleBranch(ws.id)}
                theme={theme}
                compact={compact}
              />
              {isExpanded &&
                wsAgents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} theme={theme} compact={compact} />
                ))}
              {isExpanded && wsAgents.length === 0 && (
                <View style={{ paddingHorizontal: 36, paddingVertical: 6 }}>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                    No agents in this branch.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function WorkspaceOverview({ theme, host, layout }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: wsResult, isLoading: wsLoading, error: wsError, refetch } = useQuery({
    queryKey: ["ws-list", host.id],
    queryFn: () => paseo.workspaces.list({ subscribe: {} }),
    refetchInterval: 5000,
  });

  const { data: agResult, isLoading: agLoading } = useQuery({
    queryKey: ["ag-list", host.id],
    queryFn: () => paseo.agents.list({ scope: "active" }),
    refetchInterval: 5000,
  });

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleToggleBranch = useCallback((workspaceId: string) => {
    setExpanded((prev) => ({ ...prev, [workspaceId]: !prev[workspaceId] }));
  }, []);

  const { columns, cardWidth } = useMemo(() => {
    if (containerWidth <= 0) return { columns: 1, cardWidth: 0 };
    let cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_TARGET_WIDTH + CARD_GAP)));
    let w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    while (cols > 1 && w < CARD_MIN_WIDTH) {
      cols -= 1;
      w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    }
    return { columns: cols, cardWidth: w };
  }, [containerWidth]);

  // Group workspaces by project, and agents by workspace.
  const { projects, agentsByWorkspace } = useMemo(() => {
    const workspaces = (wsResult?.entries ?? []) as WorkspaceEntry[];
    const agents = (agResult?.entries ?? []) as Array<{ agent: AgentEntry }>;

    const agentsByWs = new Map<string, AgentEntry[]>();
    for (const entry of agents) {
      const wsId = entry.agent.workspaceId;
      if (!wsId) continue;
      const list = agentsByWs.get(wsId) ?? [];
      list.push(entry.agent);
      agentsByWs.set(wsId, list);
    }

    const byProject = new Map<string, { projectId: string; projectDisplayName: string; workspaces: WorkspaceEntry[] }>();
    for (const ws of workspaces) {
      const pid = ws.projectId || ws.id;
      const existing = byProject.get(pid);
      if (existing) {
        existing.workspaces.push(ws);
      } else {
        byProject.set(pid, {
          projectId: pid,
          projectDisplayName: ws.projectDisplayName || pid,
          workspaces: [ws],
        });
      }
    }

    // Sort workspaces inside each project: active (running/needs_input/attention) first, then by branch name.
    const statusWeight = (s: string) =>
      s === "running" ? 0 : s === "needs_input" ? 1 : s === "attention" ? 2 : s === "done" ? 3 : 4;
    for (const project of byProject.values()) {
      project.workspaces.sort((a, b) => {
        const w = statusWeight(a.status) - statusWeight(b.status);
        if (w !== 0) return w;
        return a.name.localeCompare(b.name);
      });
    }

    // Sort projects by display name.
    const projects = Array.from(byProject.values()).sort((a, b) =>
      a.projectDisplayName.localeCompare(b.projectDisplayName),
    );

    return { projects, agentsByWorkspace: agentsByWs };
  }, [wsResult, agResult]);

  if (wsLoading || agLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>
      </View>
    );
  }

  if (wsError) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{wsError.message}</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.accent }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalWorkspaces = projects.reduce((sum, p) => sum + p.workspaces.length, 0);
  const totalAgents = (agResult?.entries ?? []).length;
  const horizontalPadding = layout.compact ? 12 : 20;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "700" as const }}>
          All Projects
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>
          {host.label} · {projects.length} project{projects.length !== 1 ? "s" : ""} · {totalWorkspaces} branch{totalWorkspaces !== 1 ? "es" : ""} · {totalAgents} agent{totalAgents !== 1 ? "s" : ""}
        </Text>
      </View>

      {projects.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 24 }}>
          <Text style={{ color: theme.colors.foregroundMuted, textAlign: "center" as const }}>
            No projects found.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: horizontalPadding,
            paddingBottom: 24,
            paddingTop: 4,
          }}
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
            {cardWidth > 0 &&
              projects.map((project) => (
                <ProjectCard
                  key={project.projectId}
                  projectId={project.projectId}
                  projectDisplayName={project.projectDisplayName}
                  workspaces={project.workspaces}
                  agentsByWorkspace={agentsByWorkspace}
                  expanded={expanded}
                  onToggleBranch={handleToggleBranch}
                  theme={theme}
                  compact={layout.compact}
                  width={cardWidth}
                />
              ))}
            {columns > 1 &&
              Array.from({ length: columns - 1 }).map((_, i) => (
                <View key={`spacer-${i}`} style={{ width: cardWidth }} />
              ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
