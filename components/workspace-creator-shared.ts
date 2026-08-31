import type { Dispatch, SetStateAction } from "react";
import type { ChatModelAdapter, ChatModelRunOptions } from "@assistant-ui/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";

export type PaseoClient = ReturnType<typeof import("@getpaseo/plugin").usePaseo>;
export type OpenMenu = "project" | "host" | "isolation" | "base" | "launch" | "provider" | "model" | "mode" | "thinking" | null;
export type Isolation = "local" | "worktree";
export type LaunchTarget = { kind: "chat" } | { kind: "terminal"; profileId: string };

export interface TerminalProfile {
  id: string;
  name: string;
  command: string;
  args: string[];
  icon?: string;
}

export interface GitBranchOption {
  id: string;
  label: string;
  detail: string;
}

export interface WorkspaceProjectOption {
  projectId: string;
  projectDisplayName: string;
  projectDirectory: string;
  branches: GitBranchOption[];
  defaultBranch: string | null;
  projectIconDataUri?: string | null;
}

interface ThinkingOption {
  id: string;
  label?: string;
  isDefault?: boolean;
}

interface ProviderModel {
  id: string;
  label: string;
  isSelectable?: boolean;
  isDefault?: boolean;
  defaultThinkingOptionId?: string;
  thinkingOptions?: ThinkingOption[];
}

export interface ProviderEntry {
  provider: string;
  status: "ready" | "loading" | "error" | "unavailable" | string;
  enabled?: boolean;
  label?: string;
  defaultModeId?: string | null;
  modes?: Array<{ id: string; label?: string; description?: string; icon?: string }>;
  models?: ProviderModel[];
}

export interface ProviderSnapshot {
  entries: ProviderEntry[];
}

export interface ComposerSelection {
  providerId: string;
  providerLabel: string;
  modelId: string | null;
  modelLabel: string | null;
  modeId: string | null;
  modeLabel: string | null;
  thinkingOptionId: string | null;
  thinkingLabel: string | null;
}

interface PaseoProviderModelPreference {
  providerId: string;
  modelId: string | null;
}

export interface WorkspaceCreatorPanelProps {
  projectId: string;
  projectDisplayName: string;
  projectDirectory: string | undefined;
  hostLabel: string;
  hostId: string;
  navigation: NonNullable<PluginSurfaceProps["navigation"]>;
  projects: WorkspaceProjectOption[];
  paseo: PaseoClient;
  onClose: () => void;
  onCreate?: () => void;
  theme: PluginSurfaceProps["theme"];
}

export interface MenuOption {
  id: string;
  label: string;
  detail?: string;
  iconName?: string;
  projectIconDataUri?: string | null;
}

const WORKTREE_SLUG_PREFIX = "workspace";
const PASEO_CREATE_AGENT_PREFERENCES_KEY = "@paseo:create-agent-preferences";
export const PROVIDER_READY_TIMEOUT_MS = 10000;
export const MAX_MENU_HEIGHT = 260;
export const MENU_WIDTH_BY_KIND: Record<Exclude<OpenMenu, null>, number> = {
  project: 360,
  host: 240,
  isolation: 220,
  base: 240,
  launch: 260,
  provider: 260,
  model: 340,
  mode: 220,
  thinking: 240,
};

function createWorktreeSlug(): string {
  return `${WORKTREE_SLUG_PREFIX}-${Date.now().toString(36)}`;
}

export function readPaseoProviderModelPreference(): PaseoProviderModelPreference | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  try {
    const raw = globalThis.localStorage.getItem(PASEO_CREATE_AGENT_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      provider?: unknown;
      providerPreferences?: Record<string, { model?: unknown }>;
    };
    if (typeof parsed.provider !== "string" || !parsed.provider.trim()) return null;
    const model = parsed.providerPreferences?.[parsed.provider]?.model;
    return {
      providerId: parsed.provider,
      modelId: typeof model === "string" && model.trim() ? model : null,
    };
  } catch {
    return null;
  }
}

function getSubmittedText(options: ChatModelRunOptions): string {
  const message = options.messages
    .slice()
    .reverse()
    .find((entry) => entry.role === "user");
  if (!message) return "";
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export function readyProviders(snapshot: ProviderSnapshot): ProviderEntry[] {
  return snapshot.entries.filter((entry) => entry.enabled !== false && entry.status === "ready");
}

export function selectableModels(entry: ProviderEntry | null): ProviderModel[] {
  return (entry?.models ?? []).filter((model) => model.isSelectable !== false);
}

export function defaultModel(entry: ProviderEntry | null): ProviderModel | null {
  const models = selectableModels(entry);
  return models.find((model) => model.isDefault) ?? models[0] ?? null;
}

function defaultMode(entry: ProviderEntry | null): { id: string; label?: string } | null {
  if (!entry) return null;
  return (
    entry.modes?.find((mode) => mode.id === entry.defaultModeId) ??
    entry.modes?.[0] ??
    (entry.defaultModeId ? { id: entry.defaultModeId } : null)
  );
}

function defaultThinking(model: ProviderModel | null): ThinkingOption | null {
  if (!model) return null;
  return (
    model.thinkingOptions?.find((option) => option.id === model.defaultThinkingOptionId) ??
    model.thinkingOptions?.find((option) => option.isDefault) ??
    model.thinkingOptions?.[0] ??
    null
  );
}

export function buildSelection(entry: ProviderEntry, model = defaultModel(entry)): ComposerSelection {
  const mode = defaultMode(entry);
  const thinking = defaultThinking(model);
  return {
    providerId: entry.provider,
    providerLabel: entry.label ?? entry.provider,
    modelId: model?.id ?? null,
    modelLabel: model?.label ?? null,
    modeId: mode?.id ?? null,
    modeLabel: mode?.label ?? mode?.id ?? null,
    thinkingOptionId: thinking?.id ?? null,
    thinkingLabel: thinking?.label ?? thinking?.id ?? null,
  };
}

export function defaultSelection(
  snapshot: ProviderSnapshot,
  preferred: PaseoProviderModelPreference | null = readPaseoProviderModelPreference(),
): ComposerSelection | null {
  const entries = readyProviders(snapshot);
  const preferredProviderId = preferred?.providerId ?? null;
  const preferredModelId = preferred?.modelId ?? null;
  const preferredEntry = preferredProviderId
    ? entries.find((item) => item.provider === preferredProviderId) ?? null
    : null;
  if (preferredEntry) {
    const preferredModel = preferredModelId
      ? selectableModels(preferredEntry).find((model) => model.id === preferredModelId) ?? null
      : null;
    return buildSelection(preferredEntry, preferredModel ?? defaultModel(preferredEntry));
  }
  const entry =
    entries.find((item) => item.provider === "codex") ??
    entries.find((item) => item.provider.toLowerCase().includes("codex")) ??
    entries[0] ??
    null;
  return entry ? buildSelection(entry) : null;
}

function providerModelId(selection: ComposerSelection): string {
  return selection.modelId ? `${selection.providerId}/${selection.modelId}` : selection.providerId;
}

async function ensureSelection(input: {
  paseo: PaseoClient;
  projectDirectory: string;
  snapshot: ProviderSnapshot | null;
  selection: ComposerSelection | null;
}): Promise<ComposerSelection> {
  if (input.selection) return input.selection;
  const snapshot =
    input.snapshot ??
    (await input.paseo.providers.waitForReady({
      cwd: input.projectDirectory,
      timeoutMs: PROVIDER_READY_TIMEOUT_MS,
    }));
  const selection = defaultSelection(snapshot);
  if (!selection) {
    throw new Error("没有可用的 provider");
  }
  return selection;
}

export function createWorkspaceChatModel(input: {
  project: WorkspaceProjectOption | null;
  isolation: Isolation;
  baseBranch: string;
  paseo: PaseoClient;
  snapshot: ProviderSnapshot | null;
  selection: ComposerSelection | null;
  launchTarget: LaunchTarget;
  terminalProfiles: TerminalProfile[];
  launchTerminal: (input: {
    workspaceDirectory: string;
    workspaceId: string;
    serverId: string;
    prompt: string;
    profile: { name: string; command: string; args: string[] } | null;
  }) => Promise<{ terminalId: string }>;
  openAgent: (agentId: string) => void | Promise<unknown>;
  serverId: string;
  setSelection: (selection: ComposerSelection) => void;
  setPending: (pending: boolean) => void;
  setError: (error: string | null) => void;
  onDone: () => void;
}): ChatModelAdapter {
  return {
    async run(options) {
      const prompt = getSubmittedText(options);
      if (!prompt || !input.project) {
        return { content: [] };
      }

      input.setPending(true);
      input.setError(null);

      try {
        if (input.launchTarget.kind === "terminal") {
          const workspace = await input.paseo.workspaces.create({
            source:
              input.isolation === "worktree"
                ? {
                    kind: "worktree",
                    cwd: input.project.projectDirectory,
                    projectId: input.project.projectId,
                    worktreeSlug: createWorktreeSlug(),
                    action: "branch-off",
                    baseBranch: input.baseBranch,
                  }
                : {
                    kind: "directory",
                    path: input.project.projectDirectory,
                    projectId: input.project.projectId,
                  },
          });
          const current = workspace.current() ?? (await workspace.refresh());
          const workspaceDirectory = current?.workspaceDirectory ?? workspace.directory;
          if (!workspaceDirectory) throw new Error("创建的 Workspace 没有可用目录");
          const profileId = input.launchTarget.profileId;
          const profile =
            profileId === "blank"
              ? null
              : input.terminalProfiles.find((item) => item.id === profileId) ?? null;
          const { terminalId } = await input.launchTerminal({
            workspaceDirectory,
            workspaceId: workspace.id,
            serverId: input.serverId,
            prompt,
            profile: profile
              ? { name: profile.name, command: profile.command, args: profile.args }
              : null,
          });
          if (typeof globalThis.location !== "undefined") {
            const route = `paseo://app/h/${encodeURIComponent(input.serverId)}/workspace/${encodeURIComponent(workspace.id)}?open=${encodeURIComponent(`terminal:${terminalId}`)}`;
            globalThis.location.assign(route);
          }
          input.onDone();
          return { content: [] };
        }

        const selection = await ensureSelection({
          paseo: input.paseo,
          projectDirectory: input.project.projectDirectory,
          snapshot: input.snapshot,
          selection: input.selection,
        });
        input.setSelection(selection);

        const workspace = await input.paseo.workspaces.create({
          source:
            input.isolation === "worktree"
              ? {
                  kind: "worktree",
                  cwd: input.project.projectDirectory,
                  projectId: input.project.projectId,
                  worktreeSlug: createWorktreeSlug(),
                  action: "branch-off",
                  baseBranch: input.baseBranch,
                }
              : {
                  kind: "directory",
                  path: input.project.projectDirectory,
                  projectId: input.project.projectId,
                },
          firstAgentContext: { prompt },
        });

        const agent = await workspace.agents.create({
          config: {
            provider: providerModelId(selection),
            ...(selection.modeId ? { modeId: selection.modeId } : {}),
            ...(selection.thinkingOptionId
              ? { thinkingOptionId: selection.thinkingOptionId }
              : {}),
          },
          prompt,
        });

        await input.openAgent(agent.id);

        input.onDone();
        return { content: [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        input.setError(message);
        return {
          content: [{ type: "text", text: message }],
          status: { type: "incomplete", reason: "error", error: { message } },
        };
      } finally {
        input.setPending(false);
      }
    },
  };
}

export function providerById(snapshot: ProviderSnapshot | null, providerId: string): ProviderEntry | null {
  return readyProviders(snapshot ?? { entries: [] }).find((entry) => entry.provider === providerId) ?? null;
}

export function formatControlValue(value: string | null, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

export function opaqueSurfaceColor(surface: string, foreground: string): string {
  const rgba = surface.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) return `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
  if (/^#[0-9a-f]{8}$/i.test(surface)) return surface.slice(0, 7);
  if (/^#[0-9a-f]{6}$/i.test(surface)) return surface;

  const foregroundHex = foreground.match(/^#([0-9a-f]{6})$/i)?.[1];
  const foregroundRgb = foreground.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  const red = foregroundHex ? Number.parseInt(foregroundHex.slice(0, 2), 16) : Number(foregroundRgb?.[1] ?? 0);
  const green = foregroundHex ? Number.parseInt(foregroundHex.slice(2, 4), 16) : Number(foregroundRgb?.[2] ?? 0);
  const blue = foregroundHex ? Number.parseInt(foregroundHex.slice(4, 6), 16) : Number(foregroundRgb?.[3] ?? 0);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 128 ? "#171717" : "#ffffff";
}
