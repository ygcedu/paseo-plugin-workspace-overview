import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type PaseoClient = ReturnType<typeof import("@getpaseo/plugin/client").usePaseo>;
export type OpenMenu = "project" | "host" | "isolation" | "base" | "launch" | "provider" | "model" | "mode" | "thinking" | null;
export type Isolation = "local" | "worktree";
export type LaunchTarget = { kind: "chat" } | { kind: "terminal"; profileId: string };

export interface TerminalProfile { id: string; name: string; command: string; args: string[]; icon?: string }
export interface GitBranchOption { id: string; label: string; detail: string }
export interface WorkspaceProjectOption {
  projectId: string; projectDisplayName: string; projectDirectory: string;
  branches: GitBranchOption[]; defaultBranch: string | null; projectIconDataUri?: string | null;
}
export interface ThinkingOption { id: string; label?: string; isDefault?: boolean }
export interface ProviderModel {
  id: string; label: string; isSelectable?: boolean; isDefault?: boolean;
  defaultThinkingOptionId?: string; thinkingOptions?: ThinkingOption[];
}
export interface ProviderEntry {
  provider: string; status: "ready" | "loading" | "error" | "unavailable" | string;
  enabled?: boolean; label?: string; defaultModeId?: string | null;
  modes?: Array<{ id: string; label?: string; description?: string; icon?: string }>;
  models?: ProviderModel[];
}
export interface ProviderSnapshot { entries: ProviderEntry[] }
export interface ComposerSelection {
  providerId: string; providerLabel: string; modelId: string | null; modelLabel: string | null;
  modeId: string | null; modeLabel: string | null; thinkingOptionId: string | null; thinkingLabel: string | null;
}
export interface PaseoProviderModelPreference { providerId: string; modelId: string | null }
export interface WorkspaceCreatorPanelProps {
  projectId: string; projectDisplayName: string; projectDirectory: string | undefined;
  hostLabel: string; hostId: string; navigation: NonNullable<PluginSurfaceProps["navigation"]>;
  projects: WorkspaceProjectOption[]; paseo: PaseoClient; onClose: () => void; onCreate?: () => void;
  initialPanelWidth?: number; maxPanelWidth?: number;
  theme: PluginSurfaceProps["theme"]; layout: PluginSurfaceProps["layout"];
}
export interface MenuOption {
  id: string; label: string; detail?: string; iconName?: string; projectIconDataUri?: string | null;
}
