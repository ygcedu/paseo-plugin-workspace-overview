import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { ModelBrowserMenu } from "./ModelBrowserMenu";
import { Menu } from "./WorkspaceMenu";
import { SelectControl } from "./WorkspaceSelectControl";
import {
  providerById,
  readyProviders,
  selectableModels,
  defaultModel,
} from "../workspace-creator/provider-selection";
import { formatControlValue } from "../workspace-creator/ui-utils";
import type {
  ComposerSelection,
  OpenMenu,
  ProviderSnapshot,
} from "../workspace-creator/types";
import { createComposerStyles } from "./workspace-creator-styles";

function getColors(theme: PluginSurfaceProps["theme"]) {
  if (!theme || !theme.colors) {
    return {
      surface0: "#1e1e1e",
      surface1: "#252526",
      foreground: "#ffffff",
      foregroundMuted: "#888888",
      accent: "#007acc",
      accentForeground: "#ffffff",
      statusWarning: "#f59e0b",
      statusDanger: "#ef4444",
    };
  }
  return theme.colors;
}

export interface SharedComposerInputProps {
  /** Current selection state (provider/model/mode/thinking) */
  selection: ComposerSelection | null;
  /** Provider snapshot with all available providers */
  snapshot: ProviderSnapshot | null;
  /** Whether providers are still loading */
  providerLoading: boolean;
  /** Currently open dropdown menu */
  openMenu: OpenMenu;
  /** Callback to toggle/close menus */
  onToggleMenu: (menu: OpenMenu) => void;
  /** Callback when selection changes */
  onSelectModel: (combinedId: string) => void;
  onSelectMode: (modeId: string) => void;
  onSelectThinking: (thinkingId: string) => void;
  /** Whether agent is currently running (shows stop button instead of send) */
  isAgentRunning: boolean;
  /** Whether a cancel operation is in progress */
  isCancelling: boolean;
  /** Callback to cancel the running agent */
  onCancel: () => void;
  /** Placeholder text for the input */
  placeholder: string;
  /** Theme from plugin surface */
  theme: PluginSurfaceProps["theme"];
  /** Optional: disable the send button (e.g., when pending) */
  disabled?: boolean;
  showAgentControls?: boolean;
  autoFocus?: boolean;
  inputNativeID?: string;
  pendingLabel?: string | null;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  usage?: { contextWindowMaxTokens?: number; contextWindowUsedTokens?: number; totalCostUsd?: number } | null;
}

export function SharedComposerInput({
  selection,
  snapshot,
  providerLoading,
  openMenu,
  onToggleMenu,
  onSelectModel,
  onSelectMode,
  onSelectThinking,
  isAgentRunning,
  isCancelling,
  onCancel,
  placeholder,
  theme,
  disabled = false,
  showAgentControls = true,
  autoFocus = false,
  inputNativeID = "workspace-create-prompt",
  pendingLabel = null,
  value,
  onChangeText,
  onSubmit,
  usage = null,
}: SharedComposerInputProps) {
  const colors = getColors(theme);
  const styles = useMemo(() => createComposerStyles(theme), [theme]);
  const hasInput = value.trim().length > 0;
  const usagePercentage = usage?.contextWindowMaxTokens && usage.contextWindowUsedTokens != null
    ? Math.max(0, Math.min(100, Math.round((usage.contextWindowUsedTokens / usage.contextWindowMaxTokens) * 100)))
    : null;
  const usageColor = usagePercentage != null && usagePercentage > 90
    ? colors.statusDanger
    : usagePercentage != null && usagePercentage >= 70
      ? colors.statusWarning
      : colors.foregroundMuted;

  // Derived state for selectors (mirrors WorkspaceCreateComposer)
  const currentProvider = providerById(snapshot, selection?.providerId ?? "");
  const models = selectableModels(currentProvider);
  const modes = currentProvider?.modes ?? [];
  const selectedMode = modes.find((item) => item.id === selection?.modeId) ?? null;
  const model = models.find((item) => item.id === selection?.modelId) ?? defaultModel(currentProvider);
  const thinkingOptions = model?.thinkingOptions ?? [];

  const providers = readyProviders(snapshot ?? { entries: [] });
  const modelOptions = providers.flatMap((entry) =>
    selectableModels(entry).map((item) => ({
      id: `${entry.provider}::${item.id}`,
      label: item.label,
      detail: entry.label ?? entry.provider,
    })),
  );
  const modeOptions = (modes.length > 0
    ? modes
    : selection?.modeId ? [{ id: selection.modeId, label: selection.modeLabel ?? selection.modeId }] : []
  ).map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
    detail: item.description,
    iconName: item.icon,
  }));
  const thinkingOptionsForMenu = (thinkingOptions.length > 0
    ? thinkingOptions
    : selection?.thinkingOptionId ? [{ id: selection.thinkingOptionId, label: selection.thinkingLabel ?? selection.thinkingOptionId }] : []
  ).map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
    iconName: "Brain",
  }));

  const composerMenuOpen =
    openMenu === "model" || openMenu === "mode" || openMenu === "thinking";

  return (
    <View style={[styles.inputWrapper, composerMenuOpen && styles.menuRegionActive]}>
      <TextInput
        nativeID={inputNativeID}
        style={styles.textInput}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted + "66"}
        multiline
        autoFocus={autoFocus}
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
      />

      <View style={styles.buttonRow}>
        {showAgentControls ? (
          <View style={styles.leftControls}>
            <View nativeID="workspace-create-dropdown-model" style={[styles.controlAnchor, openMenu === "model" && styles.controlAnchorOpen]}>
              <SelectControl
                kind="model"
                providerId={selection?.providerId}
                value={formatControlValue(selection?.modelLabel ?? null, "Model")}
                disabled={disabled || providerLoading}
                open={openMenu === "model"}
                onPress={() => onToggleMenu(openMenu === "model" ? null : "model")}
                theme={theme}
              />
              {openMenu === "model" ? (
                <ModelBrowserMenu
                  providers={providers}
                  selection={selection}
                  onSelect={onSelectModel}
                  theme={theme}
                />
              ) : null}
            </View>

            {thinkingOptionsForMenu.length > 0 ? (
              <View nativeID="workspace-create-dropdown-thinking" style={[styles.controlAnchor, openMenu === "thinking" && styles.controlAnchorOpen]}>
                <SelectControl
                  kind="thinking"
                  value={formatControlValue(selection?.thinkingLabel ?? null, "Thinking")}
                  disabled={disabled || providerLoading}
                  open={openMenu === "thinking"}
                  onPress={() => onToggleMenu(openMenu === "thinking" ? null : "thinking")}
                  theme={theme}
                />
                {openMenu === "thinking" ? (
                  <Menu
                    kind="thinking"
                    options={thinkingOptionsForMenu}
                    selectedId={selection?.thinkingOptionId ?? null}
                    onSelect={onSelectThinking}
                    theme={theme}
                  />
                ) : null}
              </View>
            ) : null}

            {modeOptions.length > 0 ? (
              <View nativeID="workspace-create-dropdown-mode" style={[styles.controlAnchor, openMenu === "mode" && styles.controlAnchorOpen]}>
                <SelectControl
                  kind="mode"
                  iconName={selectedMode?.icon ?? "Bot"}
                  value={formatControlValue(selection?.modeLabel ?? null, "Mode")}
                  disabled={disabled || providerLoading}
                  open={openMenu === "mode"}
                  onPress={() => onToggleMenu(openMenu === "mode" ? null : "mode")}
                  theme={theme}
                />
                {openMenu === "mode" ? (
                  <Menu
                    kind="mode"
                    options={modeOptions}
                    selectedId={selection?.modeId ?? null}
                    onSelect={onSelectMode}
                    theme={theme}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.leftControls} />
        )}

        <View style={styles.rightControls}>
          {usagePercentage != null ? <View
            accessibilityRole="image"
            accessibilityLabel={`上下文已使用 ${usagePercentage}%${usage?.totalCostUsd ? `，费用 $${usage.totalCostUsd.toFixed(usage.totalCostUsd < 0.01 ? 4 : 2)}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: usageColor }} />
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{usagePercentage}%</Text>
          </View> : null}
          {pendingLabel ? <Text style={styles.pendingText}>{pendingLabel}</Text> : null}
          {isAgentRunning && !hasInput ? (
            <Pressable
              accessibilityLabel={isCancelling ? "正在停止…" : "停止 Agent"}
              onPress={onCancel}
              disabled={isCancelling}
              style={[styles.sendButton, disabled && styles.disabled]}
            >
              <Icon name={isCancelling ? "Loader" : "Square"} color="#fff" size={14} />
            </Pressable>
          ) : hasInput ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="发送"
              disabled={disabled || !hasInput}
              onPress={() => void onSubmit()}
              style={[styles.sendButton, (disabled || !hasInput) && styles.disabled]}
            >
              <Icon name="CornerDownLeft" color={colors.accentForeground} size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
