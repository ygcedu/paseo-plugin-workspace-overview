import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { WorkspaceEntry } from "../../shared/overview-types";
import { gitBranchesRpc } from "../../shared/git-branches";
import { projectIconRpc } from "../../shared/project-icon";

function projectSourceDirectory(workspaces: WorkspaceEntry[]): string | undefined {
  return workspaces.find((workspace) => workspace.workspaceKind !== "worktree")?.workspaceDirectory
    ?? workspaces[0]?.workspaceDirectory;
}

function currentWorkspaceBranches(workspaces: WorkspaceEntry[]) {
  const branches = new Set<string>();
  for (const workspace of workspaces) {
    const branch = workspace.gitRuntime?.currentBranch?.trim();
    if (branch) branches.add(branch);
  }
  return Array.from(branches, (branch) => ({ id: branch, label: branch, detail: "当前 Workspace 分支" }));
}

export function useProjectOptions(
  hostId: string,
  projects: Array<{ projectId: string; projectDisplayName: string; workspaces: WorkspaceEntry[] }>,
) {
  const baseOptions = useMemo(() => projects.flatMap((project) => {
    const projectDirectory = projectSourceDirectory(project.workspaces);
    if (!projectDirectory) return [];
    const branches = currentWorkspaceBranches(project.workspaces);
    return [{
      projectId: project.projectId,
      projectDisplayName: project.projectDisplayName,
      projectDirectory,
      branches,
      defaultBranch: branches[0]?.id ?? null,
    }];
  }), [projects]);

  const getProjectIcon = useRpc(projectIconRpc);
  const getGitBranches = useRpc(gitBranchesRpc);
  const projectIds = baseOptions.map((item) => item.projectId);
  const projectDirectories = baseOptions.map((item) => item.projectDirectory);

  const { data: icons = new Map<string, string | null>() } = useQuery({
    queryKey: ["workspace-overview-project-icons", hostId, projectIds],
    queryFn: async () => new Map(await Promise.all(baseOptions.map(async (project) => [
      project.projectId,
      (await getProjectIcon({ projectId: project.projectId, projectDirectory: project.projectDirectory })).dataUri,
    ] as const))),
    enabled: baseOptions.length > 0,
    staleTime: 60_000,
  });

  const { data: branches = new Map<string, Awaited<ReturnType<typeof getGitBranches>>>() } = useQuery({
    queryKey: ["workspace-overview-git-branches", hostId, projectDirectories],
    queryFn: async () => new Map(await Promise.all(baseOptions.map(async (project) => [
      project.projectId,
      await getGitBranches({ projectDirectory: project.projectDirectory }),
    ] as const))),
    enabled: baseOptions.length > 0,
    staleTime: 10_000,
  });

  return useMemo(() => baseOptions.map((project) => ({
    ...project,
    branches: branches.get(project.projectId)?.branches ?? project.branches,
    defaultBranch: branches.get(project.projectId)?.defaultBranch ?? project.defaultBranch,
    projectIconDataUri: icons.get(project.projectId) ?? null,
  })), [baseOptions, branches, icons]);
}

export { projectSourceDirectory };
