import type { PluginContext } from "@getpaseo/plugin";
import { WorkspaceOverview } from "./workspace-overview.client";
import { WorkspaceAgentsPanel } from "./workspace-agents.client";

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

  return () => {};
}
