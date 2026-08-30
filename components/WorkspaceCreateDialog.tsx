import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
} from "@assistant-ui/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";

type PaseoClient = ReturnType<typeof import("@getpaseo/plugin").usePaseo>;
type OpenMenu = "project" | "host" | "isolation" | "base" | "launch" | "provider" | "model" | "mode" | "thinking" | null;
type Isolation = "local" | "worktree";

interface WorkspaceProjectOption {
  projectId: string;
  projectDisplayName: string;
  projectDirectory: string;
  branches: string[];
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

interface ProviderEntry {
  provider: string;
  status: "ready" | "loading" | "error" | "unavailable" | string;
  enabled?: boolean;
  label?: string;
  defaultModeId?: string | null;
  modes?: Array<{ id: string; label?: string }>;
  models?: ProviderModel[];
}

interface ProviderSnapshot {
  entries: ProviderEntry[];
}

interface ComposerSelection {
  providerId: string;
  providerLabel: string;
  modelId: string | null;
  modelLabel: string | null;
  modeId: string | null;
  modeLabel: string | null;
  thinkingOptionId: string | null;
  thinkingLabel: string | null;
}

interface WorkspaceCreateDialogProps {
  projectId: string;
  projectDisplayName: string;
  projectDirectory: string | undefined;
  hostLabel: string;
  projects: WorkspaceProjectOption[];
  paseo: PaseoClient;
  onClose: () => void;
  onCreate?: () => void;
  theme: PluginSurfaceProps["theme"];
}

interface MenuOption {
  id: string;
  label: string;
  detail?: string;
}

const WORKTREE_SLUG_PREFIX = "workspace";
const PROVIDER_READY_TIMEOUT_MS = 10000;
const MAX_MENU_HEIGHT = 260;
const MENU_WIDTH_BY_KIND: Record<Exclude<OpenMenu, null>, number> = {
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

function readyProviders(snapshot: ProviderSnapshot): ProviderEntry[] {
  return snapshot.entries.filter((entry) => entry.enabled !== false && entry.status === "ready");
}

function selectableModels(entry: ProviderEntry | null): ProviderModel[] {
  return (entry?.models ?? []).filter((model) => model.isSelectable !== false);
}

function defaultModel(entry: ProviderEntry | null): ProviderModel | null {
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

function buildSelection(entry: ProviderEntry, model = defaultModel(entry)): ComposerSelection {
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

function defaultSelection(snapshot: ProviderSnapshot): ComposerSelection | null {
  const entries = readyProviders(snapshot);
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

function createWorkspaceChatModel(input: {
  project: WorkspaceProjectOption | null;
  isolation: Isolation;
  baseBranch: string;
  paseo: PaseoClient;
  snapshot: ProviderSnapshot | null;
  selection: ComposerSelection | null;
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

        await workspace.agents.create({
          config: {
            provider: providerModelId(selection),
            ...(selection.modeId ? { modeId: selection.modeId } : {}),
            ...(selection.thinkingOptionId
              ? { thinkingOptionId: selection.thinkingOptionId }
              : {}),
          },
          prompt,
        });

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

function providerById(snapshot: ProviderSnapshot | null, providerId: string): ProviderEntry | null {
  return readyProviders(snapshot ?? { entries: [] }).find((entry) => entry.provider === providerId) ?? null;
}

function formatControlValue(value: string | null, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

function opaqueSurfaceColor(surface: string, foreground: string): string {
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

function ControlGlyph({ kind, color }: { kind: Exclude<OpenMenu, null>; color: string }) {
  const names: Record<Exclude<OpenMenu, null>, string> = {
    project: "Folder",
    host: "Circle",
    isolation: "GitBranch",
    base: "GitBranch",
    launch: "MessageCircle",
    provider: "Boxes",
    model: "Atom",
    mode: "ListFilter",
    thinking: "Brain",
  };
  return <Icon name={names[kind]} color={color} size={16} />;
}

function Badge({
  icon,
  label,
  selectable = false,
  disabled = false,
  onPress,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  selectable?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createBadgeStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityRole={selectable ? "button" : undefined}
      accessibilityLabel={selectable ? `切换 ${label}` : undefined}
      accessibilityState={{ disabled: !selectable || disabled }}
      disabled={!selectable || disabled}
      onPress={onPress}
      style={[styles.badge, selectable && styles.badgeSelectable, disabled && styles.badgeDisabled]}
    >
      <View style={styles.badgeIcon}>{icon}</View>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label}
      </Text>
      {selectable ? <Icon name="ChevronDown" color={theme.colors.foregroundMuted} size={12} /> : null}
    </Pressable>
  );
}

function SelectControl({
  kind,
  value,
  disabled,
  open,
  onPress,
  theme,
  iconName,
}: {
  kind: Exclude<OpenMenu, null>;
  value: string;
  disabled?: boolean;
  open: boolean;
  onPress: () => void;
  theme: PluginSurfaceProps["theme"];
  iconName?: string;
}) {
  const styles = useMemo(() => createControlStyles(theme), [theme]);
  const iconColor = theme.colors.foregroundMuted;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.control, open && styles.controlOpen, disabled && styles.controlDisabled]}
    >
      {kind === "provider" ? null : iconName ? <Icon name={iconName} color={iconColor} size={16} /> : <ControlGlyph kind={kind} color={iconColor} />}
      <Text style={styles.controlValue} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="ChevronDown" color={iconColor} size={12} />
    </Pressable>
  );
}

function Menu({
  kind,
  placement = "above",
  options,
  selectedId,
  onSelect,
  theme,
}: {
  kind: Exclude<OpenMenu, null>;
  placement?: "above" | "below";
  options: MenuOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const window = useWindowDimensions();
  const menuBackground = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  if (options.length === 0) return null;
  const menuWidth = Math.min(MENU_WIDTH_BY_KIND[kind], Math.max(180, window.width - 80));
  const menuHeight = Math.min(
    placement === "below" ? 160 : MAX_MENU_HEIGHT,
    Math.max(120, window.height * 0.45),
  );
  return (
    <View
      style={[
        styles.menu,
        placement === "below" ? styles.menuBelow : styles.menuAbove,
        { left: 0 },
        { width: menuWidth, maxHeight: menuHeight },
      ]}
    >
      <ScrollView
        style={[styles.menuScroll, { maxHeight: menuHeight - 12 }]}
        contentContainerStyle={{ backgroundColor: menuBackground }}
      >
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              onPress={() => onSelect(option.id)}
              style={[styles.menuItem, selected && styles.menuItemSelected]}
            >
              <View style={styles.menuTextGroup}>
                <Text style={styles.menuLabel} numberOfLines={1}>
                  {option.label}
                </Text>
                {option.detail ? (
                  <Text style={styles.menuDetail} numberOfLines={1}>
                    {option.detail}
                  </Text>
                ) : null}
              </View>
              {selected ? <Icon name="Check" color={theme.colors.accent} size={13} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function providerIconName(providerId: string): string {
  const normalized = providerId.toLowerCase();
  if (normalized.includes("codex") || normalized.includes("openai")) return "Atom";
  if (normalized.includes("claude") || normalized.includes("anthropic")) return "Sparkles";
  if (normalized.includes("copilot") || normalized.includes("github")) return "Github";
  return "Bot";
}

function ModelBrowserMenu({
  providers,
  selection,
  onSelect,
  theme,
}: {
  providers: ProviderEntry[];
  selection: ComposerSelection | null;
  onSelect: (id: string) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const [providerId, setProviderId] = useState<string | null>(null);
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const backgroundColor = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  const provider = providerId ? providers.find((entry) => entry.provider === providerId) ?? null : null;
  const models = selectableModels(provider);

  return (
    <View style={[styles.menu, styles.menuAbove, styles.modelBrowserMenu, { left: 0 }]}>
      {provider ? (
        <>
          <Pressable onPress={() => setProviderId(null)} style={[styles.modelBrowserHeader, { backgroundColor }]}>
            <Icon name="ChevronLeft" color={theme.colors.foregroundMuted} size={16} />
            <Icon name={providerIconName(provider.provider)} color={theme.colors.foregroundMuted} size={16} />
            <Text style={styles.modelBrowserTitle} numberOfLines={1}>{provider.label ?? provider.provider}</Text>
          </Pressable>
          <View style={styles.modelBrowserSeparator} />
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {models.map((model) => {
              const selected = selection?.providerId === provider.provider && selection.modelId === model.id;
              return (
                <Pressable
                  key={model.id}
                  onPress={() => onSelect(`${provider.provider}::${model.id}`)}
                  style={[styles.menuItem, { backgroundColor }]}
                >
                  <View style={styles.menuTextGroup}>
                    <Text style={styles.menuLabel} numberOfLines={1}>{model.label}</Text>
                    {model.id !== model.label ? <Text style={styles.menuDetail} numberOfLines={1}>{model.id}</Text> : null}
                  </View>
                  <View style={styles.modelBrowserTrailing}>
                    {selected ? <Icon name="Check" color={theme.colors.foregroundMuted} size={16} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={[styles.modelBrowserHeading, { backgroundColor }]}>
            <Text style={styles.modelBrowserSectionLabel}>Providers</Text>
          </View>
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {providers.map((entry, index) => {
              const count = selectableModels(entry).length;
              return (
                <View key={entry.provider}>
                  {index > 0 ? <View style={styles.modelBrowserSeparator} /> : null}
                  <Pressable onPress={() => setProviderId(entry.provider)} style={[styles.menuItem, styles.modelBrowserProviderRow, { backgroundColor }]}>
                    <Icon name={providerIconName(entry.provider)} color={theme.colors.foregroundMuted} size={16} />
                    <Text style={[styles.menuLabel, styles.modelBrowserProviderLabel]} numberOfLines={1}>{entry.label ?? entry.provider}</Text>
                    <Text style={styles.modelBrowserCount}>{count} {count === 1 ? "model" : "models"}</Text>
                    <Icon name="ChevronRight" color={theme.colors.foregroundMuted} size={16} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function WorkspaceCreateComposer({
  project,
  hostLabel,
  projects,
  isolation,
  baseBranch,
  pending,
  error,
  providerLoading,
  snapshot,
  selection,
  openMenu,
  onClose,
  onToggleMenu,
  onSelectProject,
  onSelectIsolation,
  onSelectBase,
  onSelectProvider,
  onSelectModel,
  onSelectMode,
  onSelectThinking,
  theme,
}: {
  project: WorkspaceProjectOption | null;
  hostLabel: string;
  projects: WorkspaceProjectOption[];
  isolation: Isolation;
  baseBranch: string;
  pending: boolean;
  error: string | null;
  providerLoading: boolean;
  snapshot: ProviderSnapshot | null;
  selection: ComposerSelection | null;
  openMenu: OpenMenu;
  onClose: () => void;
  onToggleMenu: (menu: OpenMenu) => void;
  onSelectProject: (projectId: string) => void;
  onSelectIsolation: (isolation: Isolation) => void;
  onSelectBase: (branch: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectModel: (modelId: string) => void;
  onSelectMode: (modeId: string) => void;
  onSelectThinking: (thinkingId: string) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createComposerStyles(theme), [theme]);

  useEffect(() => {
    if (openMenu === null || typeof document === "undefined") return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[id^="workspace-create-dropdown-"]')) {
        return;
      }
      onToggleMenu(null);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [onToggleMenu, openMenu]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.workspaceCreateDialog = "true";
    style.textContent = `
      #workspace-create-prompt:focus,
      #workspace-create-prompt:focus-visible {
        outline: none !important;
        border: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const provider = providerById(snapshot, selection?.providerId ?? "");
  const providers = readyProviders(snapshot ?? { entries: [] });
  const models = selectableModels(provider);
  const modes = provider?.modes ?? [];
  const model = models.find((item) => item.id === selection?.modelId) ?? defaultModel(provider);
  const thinkingOptions = model?.thinkingOptions ?? [];

  const providerOptions = providers.map((entry) => ({
    id: entry.provider,
    label: entry.label ?? entry.provider,
    detail: entry.provider,
  }));
  const modelOptions = providers.flatMap((entry) =>
    selectableModels(entry).map((item) => ({
      id: `${entry.provider}::${item.id}`,
      label: item.label,
      detail: entry.label ?? entry.provider,
    })),
  );
  const modeOptions = modes.map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
  }));
  const thinkingOptionsForMenu = thinkingOptions.map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
  }));

  const projectOptions = projects.map((item) => ({
    id: item.projectId,
    label: item.projectDisplayName,
    detail: item.projectDirectory,
  }));
  const isolationOptions: MenuOption[] = [
    { id: "worktree", label: "新建 worktree", detail: "创建隔离分支 workspace" },
    { id: "local", label: "Local", detail: "在项目目录中创建 workspace" },
  ];
  const baseOptions = (project?.branches.length ? project.branches : ["main"]).map((branch) => ({
    id: branch,
    label: branch,
  }));
  const launchOptions: MenuOption[] = [{ id: "chat", label: "Chat", detail: "Create a chat workspace" }];
  const hostOptions: MenuOption[] = [{ id: "current", label: hostLabel }];
  const topMenuOpen = openMenu === "project" || openMenu === "host" || openMenu === "isolation" || openMenu === "base" || openMenu === "launch";
  const composerMenuOpen =
    openMenu === "provider" || openMenu === "model" || openMenu === "mode" || openMenu === "thinking";

  if (!project) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>新建 workspace</Text>
          </View>
          <Pressable disabled={pending} onPress={onClose} style={styles.closeButton}>
            <Icon name="X" color={theme.colors.foregroundMuted} size={14} />
          </Pressable>
        </View>
        <View style={[styles.formStackDesktop, topMenuOpen && styles.menuRegionActive]}>
          <View nativeID="workspace-create-dropdown-project" style={[styles.controlAnchor, openMenu === "project" && styles.controlAnchorOpen]}>
            <Badge
              icon={<Icon name="Folder" color={theme.colors.foregroundMuted} size={16} />}
              label={project.projectDisplayName}
              selectable={projects.length > 1}
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "project" ? null : "project")}
              theme={theme}
            />
            {openMenu === "project" ? (
              <Menu kind="project" placement="below" options={projectOptions} selectedId={project.projectId} onSelect={onSelectProject} theme={theme} />
            ) : null}
          </View>
          <View nativeID="workspace-create-dropdown-host" style={[styles.controlAnchor, openMenu === "host" && styles.controlAnchorOpen]}>
            <Badge
              icon={<View style={styles.hostStatusDot} />}
              label={hostLabel}
              selectable
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "host" ? null : "host")}
              theme={theme}
            />
            {openMenu === "host" ? (
              <Menu kind="host" placement="below" options={hostOptions} selectedId="current" onSelect={() => onToggleMenu(null)} theme={theme} />
            ) : null}
          </View>
          <View nativeID="workspace-create-dropdown-isolation" style={[styles.controlAnchor, openMenu === "isolation" && styles.controlAnchorOpen]}>
            <Badge
              icon={<Icon name="GitBranch" color={theme.colors.foregroundMuted} size={16} />}
              label={isolation === "worktree" ? "新建 worktree" : "Local"}
              selectable
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "isolation" ? null : "isolation")}
              theme={theme}
            />
            {openMenu === "isolation" ? (
              <Menu kind="isolation" placement="below" options={isolationOptions} selectedId={isolation} onSelect={(id) => onSelectIsolation(id === "local" ? "local" : "worktree")} theme={theme} />
            ) : null}
          </View>
          <View nativeID="workspace-create-dropdown-base" style={[styles.controlAnchor, openMenu === "base" && styles.controlAnchorOpen]}>
            <Badge
              icon={<Icon name="GitBranch" color={theme.colors.foregroundMuted} size={16} />}
              label={isolation === "worktree" ? baseBranch : project.projectDisplayName}
              selectable={isolation === "worktree" && baseOptions.length > 1}
              disabled={pending || isolation !== "worktree"}
              onPress={() => onToggleMenu(openMenu === "base" ? null : "base")}
              theme={theme}
            />
            {openMenu === "base" ? (
              <Menu kind="base" placement="below" options={baseOptions} selectedId={baseBranch} onSelect={onSelectBase} theme={theme} />
            ) : null}
          </View>
          <View style={styles.launchSpacer} />
          <View nativeID="workspace-create-dropdown-launch" style={[styles.controlAnchor, openMenu === "launch" && styles.controlAnchorOpen]}>
            <Badge
              icon={<Icon name="MessageCircle" color={theme.colors.foregroundMuted} size={16} />}
              label="Chat"
              selectable
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "launch" ? null : "launch")}
              theme={theme}
            />
            {openMenu === "launch" ? (
              <Menu kind="launch" placement="below" options={launchOptions} selectedId="chat" onSelect={() => onToggleMenu(null)} theme={theme} />
            ) : null}
          </View>
        </View>

        <ComposerPrimitive.Root style={[styles.inputWrapper, composerMenuOpen && styles.menuRegionActive]}>
          <ComposerPrimitive.Input
            nativeID="workspace-create-prompt"
            style={styles.textInput}
            placeholder="给 Agent 发消息，标记 @files，或使用 /commands 和 /skills"
            placeholderTextColor={theme.colors.foregroundMuted + "66"}
            multiline
            autoFocus
            editable={!pending}
          />

          <View style={styles.buttonRow}>
            <View style={styles.leftControls}>
              <View nativeID="workspace-create-dropdown-model" style={[styles.controlAnchor, openMenu === "model" && styles.controlAnchorOpen]}>
                <SelectControl kind="model" value={formatControlValue(selection?.modelLabel ?? null, "Model")} disabled={pending || providerLoading || modelOptions.length <= 1} open={openMenu === "model"} onPress={() => onToggleMenu(openMenu === "model" ? null : "model")} theme={theme} />
                {openMenu === "model" ? <ModelBrowserMenu providers={providers} selection={selection} onSelect={onSelectModel} theme={theme} /> : null}
              </View>
              {thinkingOptionsForMenu.length > 0 ? (
                <View nativeID="workspace-create-dropdown-thinking" style={[styles.controlAnchor, openMenu === "thinking" && styles.controlAnchorOpen]}>
                  <SelectControl kind="thinking" value={formatControlValue(selection?.thinkingLabel ?? null, "Thinking")} disabled={pending || providerLoading || thinkingOptionsForMenu.length <= 1} open={openMenu === "thinking"} onPress={() => onToggleMenu(openMenu === "thinking" ? null : "thinking")} theme={theme} />
                  {openMenu === "thinking" ? <Menu kind="thinking" options={thinkingOptionsForMenu} selectedId={selection?.thinkingOptionId ?? null} onSelect={onSelectThinking} theme={theme} /> : null}
                </View>
              ) : null}
              {modeOptions.length > 0 ? (
                <View nativeID="workspace-create-dropdown-mode" style={[styles.controlAnchor, openMenu === "mode" && styles.controlAnchorOpen]}>
                  <SelectControl kind="mode" iconName={selection?.modeId === "full-access" ? "ShieldOff" : selection?.modeId === "auto-review" ? "ShieldCheck" : "Shield"} value={formatControlValue(selection?.modeLabel ?? null, "Mode")} disabled={pending || providerLoading || modeOptions.length <= 1} open={openMenu === "mode"} onPress={() => onToggleMenu(openMenu === "mode" ? null : "mode")} theme={theme} />
                  {openMenu === "mode" ? <Menu kind="mode" options={modeOptions} selectedId={selection?.modeId ?? null} onSelect={onSelectMode} theme={theme} /> : null}
                </View>
              ) : null}
            </View>

            <View style={styles.rightControls}>
              {pending ? <Text style={styles.pendingText}>Sending</Text> : null}
              <ComposerPrimitive.Send
                disabled={pending}
                style={[styles.sendButton, pending && styles.disabled]}
              >
                <Icon name="CornerDownLeft" color={theme.colors.accentForeground} size={16} />
              </ComposerPrimitive.Send>
            </View>
          </View>
        </ComposerPrimitive.Root>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </View>
  );
}

export function WorkspaceCreateDialog({
  projectId,
  projectDisplayName,
  projectDirectory,
  hostLabel,
  projects,
  paseo,
  onClose,
  onCreate,
  theme,
}: WorkspaceCreateDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null);
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [isolation, setIsolation] = useState<Isolation>("worktree");
  const [baseBranch, setBaseBranch] = useState("main");

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectId === selectedProjectId) ?? {
        projectId,
        projectDisplayName,
        projectDirectory: projectDirectory ?? "",
        branches: ["main"],
      },
    [projectDirectory, projectDisplayName, projectId, projects, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProject.projectDirectory) return;
    let cancelled = false;
    setProviderLoading(true);
    setError(null);
    void paseo.providers
      .waitForReady({ cwd: selectedProject.projectDirectory, timeoutMs: PROVIDER_READY_TIMEOUT_MS })
      .then((nextSnapshot: ProviderSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setSelection((current) => current ?? defaultSelection(nextSnapshot));
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setProviderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, selectedProject.projectDirectory]);

  const selectProvider = useCallback(
    (providerId: string) => {
      const entry = providerById(snapshot, providerId);
      if (entry) {
        setSelection(buildSelection(entry));
      }
      setOpenMenu(null);
    },
    [snapshot],
  );

  const selectProject = useCallback(
    (nextProjectId: string) => {
      const nextProject = projects.find((project) => project.projectId === nextProjectId);
      if (!nextProject) return;
      setSelectedProjectId(nextProjectId);
      setBaseBranch(nextProject.branches.includes(baseBranch) ? baseBranch : "main");
      setSnapshot(null);
      setSelection(null);
      setOpenMenu(null);
    },
    [baseBranch, projects],
  );

  const selectBase = useCallback((branch: string) => {
    setBaseBranch(branch);
    setOpenMenu(null);
  }, []);

  const selectIsolation = useCallback((nextIsolation: Isolation) => {
    setIsolation(nextIsolation);
    setOpenMenu(null);
  }, []);

  const selectModel = useCallback(
    (combinedId: string) => {
      const separator = combinedId.indexOf("::");
      const providerId = separator >= 0 ? combinedId.slice(0, separator) : selection?.providerId ?? "";
      const modelId = separator >= 0 ? combinedId.slice(separator + 2) : combinedId;
      const entry = providerById(snapshot, providerId);
      const model = selectableModels(entry).find((item) => item.id === modelId) ?? null;
      if (entry && model) {
        setSelection(buildSelection(entry, model));
      }
      setOpenMenu(null);
    },
    [selection?.providerId, snapshot],
  );

  const selectMode = useCallback(
    (modeId: string) => {
      const entry = providerById(snapshot, selection?.providerId ?? "");
      const mode = entry?.modes?.find((item) => item.id === modeId);
      setSelection((current) =>
        current
          ? {
              ...current,
              modeId,
              modeLabel: mode?.label ?? modeId,
            }
          : current,
      );
      setOpenMenu(null);
    },
    [selection?.providerId, snapshot],
  );

  const selectThinking = useCallback(
    (thinkingOptionId: string) => {
      const entry = providerById(snapshot, selection?.providerId ?? "");
      const model = selectableModels(entry).find((item) => item.id === selection?.modelId);
      const thinking = model?.thinkingOptions?.find((item) => item.id === thinkingOptionId);
      setSelection((current) =>
        current
          ? {
              ...current,
              thinkingOptionId,
              thinkingLabel: thinking?.label ?? thinkingOptionId,
            }
          : current,
      );
      setOpenMenu(null);
    },
    [selection?.modelId, selection?.providerId, snapshot],
  );

  const chatModel = useMemo(
    () =>
      createWorkspaceChatModel({
        project: selectedProject.projectDirectory ? selectedProject : null,
        isolation,
        baseBranch,
        paseo,
        snapshot,
        selection,
        setSelection,
        setPending,
        setError,
        onDone: () => {
          onCreate?.();
          onClose();
        },
      }),
    [baseBranch, isolation, onClose, onCreate, paseo, selectedProject, selection, snapshot],
  );
  const runtime = useLocalRuntime(chatModel);

  const close = useCallback(() => {
    if (pending) return;
    setOpenMenu(null);
    setError(null);
    onClose();
  }, [onClose, pending]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WorkspaceCreateComposer
        project={selectedProject.projectDirectory ? selectedProject : null}
        hostLabel={hostLabel}
        projects={projects}
        isolation={isolation}
        baseBranch={baseBranch}
        pending={pending}
        error={error}
        providerLoading={providerLoading}
        snapshot={snapshot}
        selection={selection}
        openMenu={openMenu}
        onClose={close}
        onToggleMenu={setOpenMenu}
        onSelectProject={selectProject}
        onSelectIsolation={selectIsolation}
        onSelectBase={selectBase}
        onSelectProvider={selectProvider}
        onSelectModel={selectModel}
        onSelectMode={selectMode}
        onSelectThinking={selectThinking}
        theme={theme}
      />
    </AssistantRuntimeProvider>
  );
}

function createComposerStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  const surface1 = "surface1" in colors ? colors.surface1 : colors.surface0;
  return StyleSheet.create({
    panel: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      backgroundColor: colors.surface0,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: colors.foregroundMuted + "18",
    } as ViewStyle,
    content: {
      width: "100%",
      maxWidth: 820,
      alignSelf: "center",
    } as ViewStyle,
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
      paddingLeft: 8,
    } as ViewStyle,
    headerText: {
      flex: 1,
      minWidth: 0,
      paddingRight: 16,
    } as ViewStyle,
    title: {
      color: colors.foreground,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: "400",
    } as TextStyle,
    formStackDesktop: {
      position: "relative",
      zIndex: 1,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 32,
      paddingLeft: 16,
      paddingRight: 16,
      gap: 8,
    } as ViewStyle,
    controlAnchor: {
      position: "relative",
      flexShrink: 0,
      overflow: "visible",
    } as ViewStyle,
    controlAnchorOpen: {
      zIndex: 20,
    } as ViewStyle,
    hostBadge: {
      flexDirection: "row",
      alignItems: "center",
      height: 28,
      maxWidth: 240,
      overflow: "hidden",
      paddingHorizontal: 8,
      borderRadius: 16,
      gap: 8,
    } as ViewStyle,
    hostStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#3e704a",
      flexShrink: 0,
    } as ViewStyle,
    hostText: {
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      color: colors.foregroundMuted,
      flexShrink: 1,
    } as TextStyle,
    launchSpacer: {
      flex: 1,
    } as ViewStyle,
    closeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    inputWrapper: {
      position: "relative",
      zIndex: 2,
      flexDirection: "column",
      gap: 12,
      backgroundColor: surface1,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "33",
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
    } as ViewStyle,
    menuRegionActive: {
      zIndex: 10,
    } as ViewStyle,
    textInput: {
      width: "100%",
      minHeight: 46,
      maxHeight: 160,
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "400",
      borderWidth: 0,
      backgroundColor: "transparent",
    } as TextStyle,
    buttonRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginHorizontal: -6,
    } as ViewStyle,
    leftControls: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 0,
    } as ViewStyle,
    rightControls: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    } as ViewStyle,
    pendingText: {
      color: colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    sendButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    disabled: {
      opacity: 0.5,
    } as ViewStyle,
    errorText: {
      color: colors.statusDanger,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 10,
    } as TextStyle,
  });
}

function createBadgeStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      height: 28,
      maxWidth: 240,
      overflow: "hidden",
      paddingHorizontal: 8,
      borderRadius: 16,
      gap: 4,
    } as ViewStyle,
    badgeSelectable: {
    } as ViewStyle,
    badgeDisabled: {
      opacity: 0.5,
    } as ViewStyle,
    badgeIcon: {
      width: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    } as ViewStyle,
    badgeText: {
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      color: colors.foregroundMuted,
      flexShrink: 1,
    } as TextStyle,
  });
}

function createControlStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    control: {
      minHeight: 28,
      maxWidth: 220,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: 14,
    } as ViewStyle,
    controlOpen: {
      backgroundColor: colors.foregroundMuted + "12",
    } as ViewStyle,
    controlDisabled: {
      opacity: 0.55,
    } as ViewStyle,
    controlValue: {
      color: colors.foregroundMuted,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "400",
      minWidth: 0,
      maxWidth: 150,
    } as TextStyle,
  });
}

function createMenuStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  const menuBackground = opaqueSurfaceColor(colors.surface0, colors.foreground);
  return StyleSheet.create({
    menu: {
      position: "absolute",
      maxHeight: MAX_MENU_HEIGHT,
      zIndex: 30,
      backgroundColor: menuBackground,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "22",
      borderRadius: 8,
      paddingVertical: 4,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    } as ViewStyle,
    menuAbove: {
      bottom: 52,
    } as ViewStyle,
    menuBelow: {
      top: 36,
    } as ViewStyle,
    menuScroll: {
      maxHeight: MAX_MENU_HEIGHT - 12,
      backgroundColor: menuBackground,
    } as ViewStyle,
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: menuBackground,
    } as ViewStyle,
    menuItemSelected: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 9,
    } as ViewStyle,
    menuTextGroup: {
      flex: 1,
      minWidth: 0,
    } as ViewStyle,
    menuLabel: {
      color: colors.foreground,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500",
    } as TextStyle,
    menuDetail: {
      color: colors.foregroundMuted,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
    } as TextStyle,
    modelBrowserMenu: {
      width: 360,
      maxHeight: 400,
      overflow: "hidden",
    } as ViewStyle,
    modelBrowserHeader: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
    } as ViewStyle,
    modelBrowserTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    } as TextStyle,
    modelBrowserHeading: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
    } as ViewStyle,
    modelBrowserSectionLabel: {
      color: colors.foregroundMuted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "500",
    } as TextStyle,
    modelBrowserSeparator: {
      height: 1,
      backgroundColor: colors.foregroundMuted + "18",
    } as ViewStyle,
    modelBrowserProviderRow: {
      minHeight: 44,
    } as ViewStyle,
    modelBrowserProviderLabel: {
      flex: 1,
      minWidth: 0,
    } as TextStyle,
    modelBrowserCount: {
      color: colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    modelBrowserTrailing: {
      width: 20,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
  });
}
