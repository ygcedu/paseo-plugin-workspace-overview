import React, { useMemo } from "react";
import { Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Badge } from "./WorkspaceBadge";
import { Menu } from "./WorkspaceMenu";
import type { ComposerSelection, Isolation, LaunchTarget, MenuOption, OpenMenu, ProviderSnapshot, TerminalProfile, WorkspaceProjectOption } from "../workspace-creator/types";
import { createComposerStyles } from "./workspace-creator-styles";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { WorkspaceLaunchMenu } from "./WorkspaceLaunchMenu";
import { SharedComposerInput } from "./SharedComposerInput";

export function WorkspaceCreateComposer({
  project,
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
  onToggleMenu,
  onSelectIsolation,
  onSelectBase,
  onSelectModel,
  onSelectMode,
  onSelectThinking,
  onSelectLaunchTarget,
  theme,
  prompt,
  onPromptChange,
  onSubmit,
  compact,
}: {
  project: WorkspaceProjectOption | null;
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
  onToggleMenu: (menu: OpenMenu) => void;
  onSelectIsolation: (isolation: Isolation) => void;
  onSelectBase: (branch: string) => void;
  onSelectModel: (modelId: string) => void;
  onSelectMode: (modeId: string) => void;
  onSelectThinking: (thinkingId: string) => void;
  onSelectLaunchTarget: (target: LaunchTarget) => void;
  theme: PluginSurfaceProps["theme"];
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  compact: boolean;
}) {
  const styles = useMemo(() => createComposerStyles(theme), [theme]);

  const selectedTerminalProfile = launchTarget.kind === "terminal"
    ? terminalProfiles.find((profile) => profile.id === launchTarget.profileId) ?? null
    : null;
  const launchLabel = launchTarget.kind === "chat"
    ? "Chat"
    : selectedTerminalProfile ? `Terminal ${selectedTerminalProfile.name}` : "Terminal";

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
  const topMenuOpen = openMenu === "isolation" || openMenu === "base" || openMenu === "launch";
  if (!project) return null;

  return (
    <View style={[styles.panel, compact && { paddingHorizontal: 0, paddingVertical: 4, borderTopWidth: 0 }]}>
      <View style={styles.content}>
        <View style={[styles.formStackDesktop, compact && { flexWrap: "wrap", marginBottom: 16 }, topMenuOpen && styles.menuRegionActive]}>
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

        <SharedComposerInput
          selection={selection}
          snapshot={snapshot}
          providerLoading={providerLoading}
          openMenu={openMenu}
          onToggleMenu={onToggleMenu}
          onSelectModel={onSelectModel}
          onSelectMode={onSelectMode}
          onSelectThinking={onSelectThinking}
          isAgentRunning={false}
          isCancelling={false}
          onCancel={() => {}}
          placeholder={launchTarget.kind === "chat" ? "给 Agent 发消息，标记 @files，或使用 /commands 和 /skills" : selectedTerminalProfile ? "输入启动提示词" : "输入终端命令"}
          theme={theme}
          disabled={pending}
          showAgentControls={launchTarget.kind === "chat"}
          autoFocus
          pendingLabel={pending ? "Sending" : null}
          value={prompt}
          onChangeText={onPromptChange}
          onSubmit={onSubmit}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </View>
  );
}
