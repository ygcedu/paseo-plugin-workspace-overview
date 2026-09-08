import type { PluginClientContext } from "@getpaseo/plugin/client";
import { WorkspaceOverview } from "./client/workspace-overview";
import { WorkspaceAgentsPanel } from "./client/workspace-agents";

export default function contribute(client: PluginClientContext) {
  // Global sidebar surface: shows all workspaces with agent counts as cards
  client.addSurface("overview", WorkspaceOverview);
  client.addSidebarItem({
    id: "overview",
    title: "概述",
    icon: "LayoutGrid",
    surface: "overview",
  });

  // Workspace panel: shows agents within a specific workspace
  client.addWorkspacePanel({
    id: "agents",
    title: "Workspace Agents",
    icon: "Users",
    context: "workspace",
    Component: WorkspaceAgentsPanel,
  });

  // Command Center item to open the agents panel (⌘K → search "Workspace Agents")
  client.addCommandCenterItem({
    id: "open-agents",
    title: "Workspace Agents",
    icon: "Users",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("agents");
    },
  });

  return () => {};
}
