import type { PluginContext } from "@getpaseo/plugin";
import { WorkspaceOverview } from "./workspace-overview.client";
import { WorkspaceAgentsPanel } from "./workspace-agents.client";
import { listWorkspacesRpc } from "./overview.shared";
import { listWorkspaces } from "./overview.server";

export default function contribute(plugin: PluginContext) {
  // Register RPC handler (no-op for now, data fetched client-side)
  plugin.handle(listWorkspacesRpc, listWorkspaces);

  // Global sidebar surface: shows all workspaces with agent counts as cards
  plugin.addSurface("overview", WorkspaceOverview);
  plugin.addSidebarItem({
    id: "overview",
    title: "Overview",
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
