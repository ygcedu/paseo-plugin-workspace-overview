import { type PluginSurfaceProps } from "@getpaseo/plugin";

export type WorkspaceStatus =
  | "needs_input"
  | "failed"
  | "running"
  | "attention"
  | "done"
  | string;

export interface WorkspaceEntry {
  id: string;
  projectId: string;
  projectDisplayName: string;
  name: string;
  status: WorkspaceStatus;
  statusEnteredAt?: string | null;
  activityAt?: string | null;
  workspaceKind: "directory" | "local_checkout" | "checkout" | "worktree";
  workspaceDirectory: string;
  gitRuntime?: { currentBranch?: string | null } | null;
}

export interface AgentEntry {
  id: string;
  workspaceId?: string;
  title: string | null;
  provider: string;
  model: string | null;
  status: "initializing" | "idle" | "running" | "error" | "closed" | string;
  updatedAt?: string;
  lastUserMessageAt?: string | null;
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
}

export const KIND_LABEL: Record<WorkspaceEntry["workspaceKind"], string> = {
  worktree: "Worktree",
  checkout: "Checkout",
  local_checkout: "Local",
  directory: "Dir",
};

export interface TooltipLine {
  key: string;
  value: string;
}

export interface TooltipState {
  /** Window coordinates of the badge's right edge. */
  x: number;
  /** Window Y of the badge's bottom edge. */
  y: number;
  lines: TooltipLine[];
}

export interface TooltipContextValue {
  show: (state: TooltipState) => void;
  hide: () => void;
}

export interface ProjectCardProps {
  projectId: string;
  projectDisplayName: string;
  workspaces: WorkspaceEntry[];
  agentsByWorkspace: Map<string, AgentEntry[]>;
  /** Branch-level expand state. undefined means "user hasn't toggled; use auto rule". */
  expanded: Record<string, boolean>;
  /** Card-level expand state. Same undefined semantics as expanded. */
  cardExpanded: Record<string, boolean>;
  onToggleCard: (projectId: string, currentEffective: boolean) => void;
  onToggleBranch: (workspaceId: string, currentEffective: boolean) => void;
  onOpenDirectory: (directory: string) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  width: number;
  hostLabel: string;
  hostId: string;
  onSelectAgent: (agent: AgentEntry) => void;
  onCreateWorktree?: () => void;
}
