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

type PaseoClient = ReturnType<typeof import("@getpaseo/plugin").usePaseo>;
type OpenMenu = "project" | "isolation" | "base" | "provider" | "model" | "mode" | "thinking" | null;
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
  isolation: 220,
  base: 240,
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

function ChevronDownGlyph({ color, size = 10 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 7);
  const bar = size * 0.68;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateX: -bar * 0.23 }, { rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateX: bar * 0.23 }, { rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

function CheckGlyph({ color, size = 13 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 7);
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View
        style={{
          position: "absolute",
          width: size * 0.42,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateX: -size * 0.2 }, { translateY: size * 0.12 }, { rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.78,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateX: size * 0.13 }, { rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

function CloseGlyph({ color, size = 13 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 7);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: size,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

function ArrowUpGlyph({ color, size = 15 }: { color: string; size?: number }) {
  const thickness = Math.max(1.7, size / 8);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          left: (size - thickness) / 2,
          top: size * 0.2,
          width: thickness,
          height: size * 0.64,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.22,
          top: size * 0.3,
          width: size * 0.42,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          right: size * 0.22,
          top: size * 0.3,
          width: size * 0.42,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}

function ModelGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const dot = Math.max(3, size * 0.24);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size,
          borderWidth: 1.6,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function ModeGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 9);
  return (
    <View style={{ width: size, height: size, justifyContent: "center" }}>
      {[0.28, 0.5, 0.72].map((top, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            top: size * top,
            left: size * 0.12,
            width: size * 0.76,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function ThinkingGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size * 0.22,
          borderWidth: 1.6,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.32,
          height: size * 0.32,
          borderRadius: size * 0.16,
          borderWidth: 1.4,
          borderColor: color,
        }}
      />
    </View>
  );
}

function ProviderGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const line = Math.max(1.5, size / 8);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size * 0.16,
          borderWidth: line,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.32,
          height: line,
          borderRadius: line / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function ControlGlyph({ kind, color }: { kind: Exclude<OpenMenu, null>; color: string }) {
  if (kind === "provider") return <ProviderGlyph color={color} />;
  if (kind === "model") return <ModelGlyph color={color} />;
  if (kind === "mode") return <ModeGlyph color={color} />;
  return <ThinkingGlyph color={color} />;
}

function FolderGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 9);
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View
        style={{
          position: "absolute",
          top: size * 0.22,
          left: size * 0.12,
          width: size * 0.32,
          height: size * 0.18,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.78,
          height: size * 0.58,
          marginTop: size * 0.16,
          borderRadius: 3,
          borderWidth: thickness,
          borderColor: color,
        }}
      />
    </View>
  );
}

function BranchGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 9);
  const dot = size * 0.22;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          left: size * 0.28,
          top: size * 0.18,
          width: thickness,
          height: size * 0.64,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.28,
          top: size * 0.5,
          width: size * 0.36,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.6,
          top: size * 0.34,
          width: thickness,
          height: size * 0.18,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
      {[{ x: 0.2, y: 0.12 }, { x: 0.2, y: 0.72 }, { x: 0.52, y: 0.24 }].map((point, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: size * point.x,
            top: size * point.y,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            borderWidth: thickness,
            borderColor: color,
            backgroundColor: "transparent",
          }}
        />
      ))}
    </View>
  );
}

function ChatGlyph({ color, size = 16 }: { color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 9);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.6,
          borderRadius: size * 0.3,
          borderWidth: thickness,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.28,
          bottom: size * 0.16,
          width: size * 0.22,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ rotate: "-35deg" }],
        }}
      />
    </View>
  );
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
      {selectable ? <ChevronDownGlyph color={theme.colors.foregroundMuted} size={9} /> : null}
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
}: {
  kind: Exclude<OpenMenu, null>;
  value: string;
  disabled?: boolean;
  open: boolean;
  onPress: () => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createControlStyles(theme), [theme]);
  const iconColor = theme.colors.foregroundMuted;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.control, open && styles.controlOpen, disabled && styles.controlDisabled]}
    >
      <ControlGlyph kind={kind} color={iconColor} />
      <Text style={styles.controlValue} numberOfLines={1}>
        {value}
      </Text>
      <ChevronDownGlyph color={iconColor} size={9} />
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
              {selected ? <CheckGlyph color={theme.colors.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function WorkspaceCreateComposer({
  project,
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
  const modelOptions = models.map((item) => ({
    id: item.id,
    label: item.label,
    detail: item.id,
  }));
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
  const topMenuOpen = openMenu === "project" || openMenu === "isolation" || openMenu === "base";
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
            <CloseGlyph color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
        <View style={[styles.formStackDesktop, topMenuOpen && styles.menuRegionActive]}>
          <View nativeID="workspace-create-dropdown-project" style={[styles.controlAnchor, openMenu === "project" && styles.controlAnchorOpen]}>
            <Badge
              icon={<FolderGlyph color={theme.colors.foregroundMuted} />}
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
          <View style={styles.hostBadge}>
            <View style={styles.hostStatusDot} />
            <Text style={styles.hostText} numberOfLines={1}>
              本机
            </Text>
          </View>
          <View nativeID="workspace-create-dropdown-isolation" style={[styles.controlAnchor, openMenu === "isolation" && styles.controlAnchorOpen]}>
            <Badge
              icon={<BranchGlyph color={theme.colors.foregroundMuted} />}
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
              icon={<BranchGlyph color={theme.colors.foregroundMuted} />}
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
          <Badge icon={<ChatGlyph color={theme.colors.foregroundMuted} />} label="Chat" theme={theme} />

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
              <View nativeID="workspace-create-dropdown-provider" style={[styles.controlAnchor, openMenu === "provider" && styles.controlAnchorOpen]}>
                <SelectControl kind="provider" value={providerLoading ? "Loading" : formatControlValue(selection?.providerLabel ?? null, "Provider")} disabled={pending || providerLoading || providerOptions.length <= 1} open={openMenu === "provider"} onPress={() => onToggleMenu(openMenu === "provider" ? null : "provider")} theme={theme} />
                {openMenu === "provider" ? <Menu kind="provider" options={providerOptions} selectedId={selection?.providerId ?? null} onSelect={onSelectProvider} theme={theme} /> : null}
              </View>
              <View nativeID="workspace-create-dropdown-model" style={[styles.controlAnchor, openMenu === "model" && styles.controlAnchorOpen]}>
                <SelectControl kind="model" value={formatControlValue(selection?.modelLabel ?? null, "Model")} disabled={pending || providerLoading || modelOptions.length <= 1} open={openMenu === "model"} onPress={() => onToggleMenu(openMenu === "model" ? null : "model")} theme={theme} />
                {openMenu === "model" ? <Menu kind="model" options={modelOptions} selectedId={selection?.modelId ?? null} onSelect={onSelectModel} theme={theme} /> : null}
              </View>
              {modeOptions.length > 0 ? (
                <View nativeID="workspace-create-dropdown-mode" style={[styles.controlAnchor, openMenu === "mode" && styles.controlAnchorOpen]}>
                  <SelectControl kind="mode" value={formatControlValue(selection?.modeLabel ?? null, "Mode")} disabled={pending || providerLoading || modeOptions.length <= 1} open={openMenu === "mode"} onPress={() => onToggleMenu(openMenu === "mode" ? null : "mode")} theme={theme} />
                  {openMenu === "mode" ? <Menu kind="mode" options={modeOptions} selectedId={selection?.modeId ?? null} onSelect={onSelectMode} theme={theme} /> : null}
                </View>
              ) : null}
              {thinkingOptionsForMenu.length > 0 ? (
                <View nativeID="workspace-create-dropdown-thinking" style={[styles.controlAnchor, openMenu === "thinking" && styles.controlAnchorOpen]}>
                  <SelectControl kind="thinking" value={formatControlValue(selection?.thinkingLabel ?? null, "Thinking")} disabled={pending || providerLoading || thinkingOptionsForMenu.length <= 1} open={openMenu === "thinking"} onPress={() => onToggleMenu(openMenu === "thinking" ? null : "thinking")} theme={theme} />
                  {openMenu === "thinking" ? <Menu kind="thinking" options={thinkingOptionsForMenu} selectedId={selection?.thinkingOptionId ?? null} onSelect={onSelectThinking} theme={theme} /> : null}
                </View>
              ) : null}
            </View>

            <View style={styles.rightControls}>
              {pending ? <Text style={styles.pendingText}>Sending</Text> : null}
              <ComposerPrimitive.Send
                disabled={pending}
                style={[styles.sendButton, pending && styles.disabled]}
              >
                <ArrowUpGlyph color={theme.colors.accentForeground} />
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
    (modelId: string) => {
      const entry = providerById(snapshot, selection?.providerId ?? "");
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
      marginBottom: 16,
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
      borderWidth: 0,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
    } as ViewStyle,
    menuRegionActive: {
      zIndex: 10,
    } as ViewStyle,
    textInput: {
      width: "100%",
      minHeight: 56,
      maxHeight: 180,
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
      gap: 12,
      marginHorizontal: -6,
    } as ViewStyle,
    leftControls: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 4,
    } as ViewStyle,
    rightControls: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    } as ViewStyle,
    pendingText: {
      color: colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    sendButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
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
      gap: 8,
    } as ViewStyle,
    badgeSelectable: {
      backgroundColor: colors.foregroundMuted + "08",
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "18",
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
      gap: 7,
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
  });
}
