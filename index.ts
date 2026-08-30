import type { PluginContext } from "@getpaseo/plugin";
import { openAgentRpc } from "./shared/open-agent";
import {
  buildAgentDeepLinkUrl,
  openDeepLinkInDesktop,
} from "./open-agent-impl.server";
import { WorkspaceOverview } from "./workspace-overview.client";
import { WorkspaceAgentsPanel } from "./workspace-agents.client";
import { projectIconRpc } from "./shared/project-icon";
import { readPaseoProjectIcon } from "./project-icon-impl.server";
import { gitBranchesRpc } from "./shared/git-branches";
import { readGitBranches } from "./git-branches-impl.server";
import { terminalLaunchRpc } from "./shared/terminal-launch";
import { launchWorkspaceTerminal } from "./terminal-launch-impl.server";

export default function contribute(plugin: PluginContext) {
  // Global sidebar surface: shows all workspaces with agent counts as cards
  plugin.addSurface("overview", WorkspaceOverview);
  plugin.addSidebarItem({
    id: "overview",
    title: "概述",
    icon: "LayoutGrid",
    surface: "overview",
  });

  // Workspace panel: shows agents within a specific workspace
  plugin.addWorkspacePanel({
    id: "agents",
    title: "Workspace Agents",
    icon: "Users",
    context: "workspace",
    Component: WorkspaceAgentsPanel,
  });

  // Command Center item to open the agents panel (⌘K → search "Workspace Agents")
  plugin.addCommandCenterItem({
    id: "open-agents",
    title: "Workspace Agents",
    icon: "Users",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("agents");
    },
  });

  // Handles the client `useRpc(openAgentRpc)` call: opens the agent session in
  // the Paseo desktop app via the OS deep-link path.
  plugin.handle(openAgentRpc, async ({ agentId, serverId }) => {
    await openDeepLinkInDesktop(buildAgentDeepLinkUrl(serverId, agentId));
    return { ok: true };
  });

  plugin.handle(projectIconRpc, async ({ projectId, projectDirectory }) => ({
    dataUri: await readPaseoProjectIcon(projectId, projectDirectory),
  }));

  plugin.handle(gitBranchesRpc, async ({ projectDirectory }) =>
    readGitBranches(projectDirectory),
  );

  plugin.handle(terminalLaunchRpc, launchWorkspaceTerminal);

  return () => {};
}
