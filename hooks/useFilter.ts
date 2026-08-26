import { useCallback, useMemo } from "react";
import { type WorkspaceEntry, type AgentEntry } from "../overview.types";

export const TIME_RANGES = [
  { key: "24h", label: "近24小时", ms: 24 * 60 * 60 * 1000 },
  { key: "3d",  label: "近3天",   ms: 3 * 24 * 60 * 60 * 1000 },
  { key: "7d",  label: "近7天",   ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "近30天",  ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "全部",    ms: Infinity },
] as const;

export type TimeRange = (typeof TIME_RANGES)[number]["key"];

export function useFilter(
  projects: Array<{
    projectId: string;
    projectDisplayName: string;
    workspaces: WorkspaceEntry[];
  }>,
  agentsByWorkspace: Map<string, AgentEntry[]>,
  timeRange: TimeRange,
) {
  const rangeMs = useMemo(
    () => TIME_RANGES.find((r) => r.key === timeRange)!.ms,
    [timeRange],
  );

  const isRecent = useCallback(
    (iso: string | null | undefined) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return false;
      return Date.now() - t < rangeMs;
    },
    [rangeMs],
  );

  const filteredProjects = useMemo(() => {
    if (timeRange === "all") return projects;
    const result: Array<{
      projectId: string;
      projectDisplayName: string;
      workspaces: WorkspaceEntry[];
    }> = [];
    for (const project of projects) {
      const filteredWorkspaces = project.workspaces
        .map((ws) => {
          // Keep the workspace only if at least one agent has a user message
          // in the selected window.  Do NOT fall back to ws.activityAt or
          // ws.statusEnteredAt — those are workspace creation/status-change
          // metadata, not actual user activity.
          const wsAgents = (agentsByWorkspace.get(ws.id) ?? []).filter(
            (a) => isRecent(a.lastUserMessageAt),
          );
          return wsAgents.length > 0 ? ws : null;
        })
        .filter((ws): ws is WorkspaceEntry => ws !== null);
      if (filteredWorkspaces.length > 0) {
        result.push({ ...project, workspaces: filteredWorkspaces });
      }
    }
    return result;
  }, [projects, agentsByWorkspace, timeRange, isRecent]);

  const filteredAgentsByWorkspace = useMemo(() => {
    if (timeRange === "all") return agentsByWorkspace;
    const map = new Map<string, AgentEntry[]>();
    for (const project of filteredProjects) {
      for (const ws of project.workspaces) {
        const agents = (agentsByWorkspace.get(ws.id) ?? []).filter((a) =>
          isRecent(a.lastUserMessageAt),
        );
        if (agents.length > 0) map.set(ws.id, agents);
      }
    }
    return map;
  }, [timeRange, filteredProjects, agentsByWorkspace, isRecent]);

  const autoExpand = useMemo(() => {
    if (timeRange === "all") return {};
    const result: Record<string, boolean> = {};
    for (const project of filteredProjects) {
      result[project.projectId] = true;
      for (const ws of project.workspaces) {
        result[ws.id] = true;
      }
    }
    return result;
  }, [timeRange, filteredProjects]);

  return { filteredProjects, filteredAgentsByWorkspace, autoExpand };
}
