import React, { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { ComposerPrimitive } from "@assistant-ui/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { ModelBrowserMenu } from "./ModelBrowserMenu";
import { Badge } from "./WorkspaceBadge";
import { Menu } from "./WorkspaceMenu";
import { SelectControl } from "./WorkspaceSelectControl";
import { defaultModel, formatControlValue, providerById, readyProviders, selectableModels, type ComposerSelection, type Isolation, type LaunchTarget, type MenuOption, type OpenMenu, type ProviderSnapshot, type TerminalProfile, type WorkspaceProjectOption } from "./workspace-creator-shared";
import { createComposerStyles } from "./workspace-creator-styles";
import { ProjectIcon } from "./ProjectIcon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { WorkspaceLaunchMenu } from "./WorkspaceLaunchMenu";

export function WorkspaceCreateComposer({
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
  launchTarget,
  terminalProfiles,
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
  onSelectLaunchTarget,
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
  launchTarget: LaunchTarget;
  terminalProfiles: TerminalProfile[];
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
  onSelectLaunchTarget: (target: LaunchTarget) => void;
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
      [id^="workspace-create-menu-search-"]:focus,
      [id^="workspace-create-menu-search-"]:focus-visible,
      #workspace-create-model-search:focus,
      #workspace-create-model-search:focus-visible {
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
  const selectedMode = modes.find((item) => item.id === selection?.modeId) ?? null;
  const model = models.find((item) => item.id === selection?.modelId) ?? defaultModel(provider);
  const thinkingOptions = model?.thinkingOptions ?? [];
  const selectedTerminalProfile = launchTarget.kind === "terminal"
    ? terminalProfiles.find((profile) => profile.id === launchTarget.profileId) ?? null
    : null;
  const launchLabel = launchTarget.kind === "chat"
    ? "Chat"
    : selectedTerminalProfile ? `Terminal ${selectedTerminalProfile.name}` : "Terminal";

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
    detail: item.description,
    iconName: item.icon,
  }));
  const thinkingOptionsForMenu = thinkingOptions.map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
    iconName: "Brain",
  }));

  const projectOptions = projects.map((item) => ({
    id: item.projectId,
    label: item.projectDisplayName,
    detail: item.projectDirectory,
    projectIconDataUri: item.projectIconDataUri ?? null,
  }));
  const isolationOptions: MenuOption[] = [
    { id: "worktree", label: "新建 worktree", detail: "创建隔离分支 workspace", iconName: "GitBranch" },
    { id: "local", label: "Local", detail: "在项目目录中创建 workspace", iconName: "Folder" },
  ];
  const baseOptions = (project?.branches.length
    ? project.branches
    : [{ id: "main", label: "main", detail: "本地分支" }]
  ).map((branch) => ({
    id: branch.id,
    label: branch.label,
    detail: branch.detail,
    iconName: "GitBranch",
  }));
  const hostOptions: MenuOption[] = [{ id: "current", label: hostLabel, iconName: "Server" }];
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
              icon={<ProjectIcon dataUri={project.projectIconDataUri} label={project.projectDisplayName} size={16} theme={theme} />}
              label={project.projectDisplayName}
              selectable={projects.length > 1}
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "project" ? null : "project")}
              theme={theme}
            />
            {openMenu === "project" ? (
              <Menu kind="project" placement="above" options={projectOptions} selectedId={project.projectId} onSelect={onSelectProject} theme={theme} />
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
              <Menu kind="host" placement="above" options={hostOptions} selectedId="current" onSelect={() => onToggleMenu(null)} theme={theme} />
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
              <Menu kind="isolation" placement="above" options={isolationOptions} selectedId={isolation} onSelect={(id) => onSelectIsolation(id === "local" ? "local" : "worktree")} theme={theme} />
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
              <Menu kind="base" placement="above" options={baseOptions} selectedId={baseBranch} onSelect={onSelectBase} theme={theme} />
            ) : null}
          </View>
          <View style={styles.launchSpacer} />
          <View nativeID="workspace-create-dropdown-launch" style={[styles.controlAnchor, openMenu === "launch" && styles.controlAnchorOpen]}>
            <Badge
              icon={launchTarget.kind === "chat"
                ? <Icon name="MessageCircle" color={theme.colors.foregroundMuted} size={16} />
                : selectedTerminalProfile
                  ? <ProviderBrandIcon providerId={selectedTerminalProfile.icon ?? selectedTerminalProfile.id} color={theme.colors.foregroundMuted} size={16} />
                  : <Icon name="SquareTerminal" color={theme.colors.foregroundMuted} size={16} />}
              label={launchLabel}
              selectable
              disabled={pending}
              onPress={() => onToggleMenu(openMenu === "launch" ? null : "launch")}
              theme={theme}
            />
            {openMenu === "launch" ? (
              <WorkspaceLaunchMenu target={launchTarget} profiles={terminalProfiles} onSelect={onSelectLaunchTarget} theme={theme} />
            ) : null}
          </View>
        </View>

        <ComposerPrimitive.Root style={[styles.inputWrapper, composerMenuOpen && styles.menuRegionActive]}>
          <ComposerPrimitive.Input
            nativeID="workspace-create-prompt"
            style={styles.textInput}
            placeholder={launchTarget.kind === "chat" ? "给 Agent 发消息，标记 @files，或使用 /commands 和 /skills" : selectedTerminalProfile ? "输入启动提示词" : "输入终端命令"}
            placeholderTextColor={theme.colors.foregroundMuted + "66"}
            multiline
            autoFocus
            editable={!pending}
          />

          <View style={styles.buttonRow}>
            {launchTarget.kind === "chat" ? <View style={styles.leftControls}>
              <View nativeID="workspace-create-dropdown-model" style={[styles.controlAnchor, openMenu === "model" && styles.controlAnchorOpen]}>
                <SelectControl kind="model" providerId={selection?.providerId} value={formatControlValue(selection?.modelLabel ?? null, "Model")} disabled={pending || providerLoading || modelOptions.length <= 1} open={openMenu === "model"} onPress={() => onToggleMenu(openMenu === "model" ? null : "model")} theme={theme} />
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
                  <SelectControl kind="mode" iconName={selectedMode?.icon ?? "Bot"} value={formatControlValue(selection?.modeLabel ?? null, "Mode")} disabled={pending || providerLoading || modeOptions.length <= 1} open={openMenu === "mode"} onPress={() => onToggleMenu(openMenu === "mode" ? null : "mode")} theme={theme} />
                  {openMenu === "mode" ? <Menu kind="mode" options={modeOptions} selectedId={selection?.modeId ?? null} onSelect={onSelectMode} theme={theme} /> : null}
                </View>
              ) : null}
            </View> : <View style={styles.leftControls} />}

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
