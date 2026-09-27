import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, Text, View, useWindowDimensions, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
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
import { subscribeToImagePaste, type PastedImage } from "../web";

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

function PastedImagePill({
  image,
  disabled,
  onRemove,
  theme,
}: {
  image: PastedImage;
  disabled: boolean;
  onRemove: () => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const [hovered, setHovered] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { height } = useWindowDimensions();
  const showRemove = Platform.OS !== "web" || hovered;
  return (
    <View style={{ position: "relative" }}>
      <Modal title={image.fileName} open={previewOpen} onOpenChange={setPreviewOpen}>
        <Modal.Content scrollable={false}>
          <Image
            accessibilityLabel={`图片预览 ${image.fileName}`}
            source={{ uri: image.dataUrl }}
            resizeMode="contain"
            style={{ width: "100%", height: Math.max(120, Math.min(640, height * 0.65)) }}
          />
        </Modal.Content>
      </Modal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开图片 ${image.fileName}`}
        onPress={() => setPreviewOpen(true)}
        disabled={disabled}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          width: 50,
          height: 50,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: "hidden",
        }}
      >
        <Image source={{ uri: image.dataUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`移除图片 ${image.fileName}`}
        disabled={disabled}
        hitSlop={8}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={onRemove}
        style={{
          position: "absolute",
          top: -8,
          left: -8,
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface2,
          alignItems: "center",
          justifyContent: "center",
          opacity: showRemove ? 1 : 0,
          pointerEvents: showRemove ? "auto" : "none",
          zIndex: 1,
        }}
      >
        <Icon name="X" size={12} color={theme.colors.foregroundMuted} />
      </Pressable>
    </View>
  );
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
  images?: PastedImage[];
  onImagesChange?: (images: PastedImage[]) => void;
  onPasteError?: (message: string) => void;
  usage?: { contextWindowMaxTokens?: number; contextWindowUsedTokens?: number; totalCostUsd?: number } | null;
  onKeyPress?: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
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
  images = [],
  onImagesChange,
  onPasteError,
  usage = null,
  onKeyPress,
}: SharedComposerInputProps) {
  const [usageOpen, setUsageOpen] = useState(false);
  const colors = getColors(theme);
  const styles = useMemo(() => createComposerStyles(theme), [theme]);
  const hasInput = value.trim().length > 0 || images.length > 0;
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

  useEffect(() => subscribeToImagePaste(
    inputNativeID,
    (pasted) => onImagesChange?.([...images, ...pasted]),
    (message) => onPasteError?.(message),
  ), [images, inputNativeID, onImagesChange, onPasteError]);

  return (
    <View style={[styles.inputWrapper, composerMenuOpen && styles.menuRegionActive]}>
      {images.length > 0 ? (
        <View accessibilityLabel="图片附件" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {images.map((image, index) => (
            <PastedImagePill
              key={`${image.fileName}-${index}`}
              image={image}
              disabled={disabled}
              onRemove={() => onImagesChange?.(images.filter((_, imageIndex) => imageIndex !== index))}
              theme={theme}
            />
          ))}
        </View>
      ) : null}

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
        onKeyPress={onKeyPress}
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
          {usagePercentage != null ? <View style={{ position: "relative" }}><Pressable
            accessibilityRole="button"
            accessibilityLabel={`上下文已使用 ${usagePercentage}%${usage?.totalCostUsd ? `，费用 $${usage.totalCostUsd.toFixed(usage.totalCostUsd < 0.01 ? 4 : 2)}` : ""}`}
            onPress={() => setUsageOpen((open) => !open)}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: usageColor }} />
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{usagePercentage}%</Text>
          </Pressable>{usageOpen ? <View accessibilityLabel="上下文用量详情" style={{ position: "absolute", right: 0, bottom: 24, minWidth: 210, padding: 10, gap: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.foregroundMuted + "44", backgroundColor: colors.surface1, zIndex: 50 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Context usage</Text>
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>Used: {(usage?.contextWindowUsedTokens ?? 0).toLocaleString()} tokens</Text>
            <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>Window: {(usage?.contextWindowMaxTokens ?? 0).toLocaleString()} tokens</Text>
            {usage?.totalCostUsd != null ? <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>Cost: ${usage.totalCostUsd.toFixed(usage.totalCostUsd < 0.01 ? 4 : 2)}</Text> : null}
          </View> : null}</View> : null}
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
