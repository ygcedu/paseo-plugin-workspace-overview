import { useQuery } from "@tanstack/react-query";
import { usePaseo } from "@getpaseo/plugin/client";
import { useCallback, useMemo } from "react";
import { type WorkspaceEntry, type AgentEntry } from "../../shared/overview-types";

/** Type guard: verify an object is a valid WorkspaceEntry at runtime. */
function isWorkspaceEntry(obj: unknown): obj is WorkspaceEntry {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "projectId" in obj &&
    "projectDisplayName" in obj &&
    "name" in obj &&
    "status" in obj &&
    "workspaceKind" in obj &&
    "workspaceDirectory" in obj
  );
}

export interface UseWorkspacesResult {
  projects: Array<{
    projectId: string;
    projectDisplayName: string;
    workspaces: WorkspaceEntry[];
  }>;
  agentsByWorkspace: Map<string, AgentEntry[]>;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useWorkspaces(hostId: string): UseWorkspacesResult {
  const paseo = usePaseo();

  const { data: wsResult, isLoading: wsLoading, error: wsError, refetch: refetchWorkspaces } = useQuery({
    queryKey: ["ws-list", hostId],
    queryFn: () => paseo.workspaces.list({ subscribe: {} }),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: agResult, isLoading: agLoading, error: agError, refetch: refetchAgents } = useQuery({
    queryKey: ["ag-list", hostId],
    queryFn: () => paseo.agents.list({ filter: { includeArchived: true } }),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const refetch = useCallback(() => {
    void Promise.all([refetchWorkspaces(), refetchAgents()]);
  }, [refetchWorkspaces, refetchAgents]);

  const { projects, agentsByWorkspace } = useMemo(() => {
    const workspaces = (wsResult?.entries ?? []).filter(isWorkspaceEntry);
    const agents = (agResult?.entries ?? []) as Array<{ agent: AgentEntry }>;

    // Activity timestamp (ms) for an agent; 0 when unknown (sorts last).
    const agentActivity = (a: AgentEntry): number => {
      const iso = a.lastUserMessageAt ?? a.updatedAt;
      const t = iso ? new Date(iso).getTime() : 0;
      return Number.isNaN(t) ? 0 : t;
    };

    const agentsByWs = new Map<string, AgentEntry[]>();
    for (const entry of agents) {
      const wsId = entry.agent.workspaceId;
      if (!wsId) continue;
      const list = agentsByWs.get(wsId) ?? [];
      list.push(entry.agent);
      agentsByWs.set(wsId, list);
    }
    // Sort agents inside each workspace by last activity, newest first.
    for (const list of agentsByWs.values()) {
      list.sort((a, b) => agentActivity(b) - agentActivity(a));
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

    // Compute each workspace's "last activity" timestamp (ms since epoch).
    // Prefer the latest agent activity; fall back to workspace activityAt,
    // then statusEnteredAt. Returns 0 when nothing is known (sorts last).
    const workspaceActivity = (ws: WorkspaceEntry): number => {
      const agents = agentsByWs.get(ws.id) ?? [];
      let latest = 0;
      for (const a of agents) {
        const t = agentActivity(a);
        if (t > latest) latest = t;
      }
      if (latest > 0) return latest;
      const fallbackIso = ws.activityAt ?? ws.statusEnteredAt;
      if (fallbackIso) {
        const t = new Date(fallbackIso).getTime();
        if (!Number.isNaN(t)) return t;
      }
      return 0;
    };

    // Sort workspaces inside each project by last activity, newest first.
    for (const project of byProject.values()) {
      project.workspaces.sort((a, b) => workspaceActivity(b) - workspaceActivity(a));
    }

    // Sort projects by their own last activity (max over their workspaces), newest first.
    const projects = Array.from(byProject.values()).sort((a, b) => {
      const aMax = a.workspaces.reduce((m, ws) => Math.max(m, workspaceActivity(ws)), 0);
      const bMax = b.workspaces.reduce((m, ws) => Math.max(m, workspaceActivity(ws)), 0);
      return bMax - aMax;
    });

    return { projects, agentsByWorkspace: agentsByWs };
  }, [wsResult, agResult]);

  return {
    projects,
    agentsByWorkspace,
    isLoading: wsLoading || agLoading,
    error: wsError ?? agError,
    refetch,
  };
}
