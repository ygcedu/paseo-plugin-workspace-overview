import React, { useCallback, useMemo, useState } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";

import type { WorkspaceEntry } from "../../shared/overview-types";
import { providerModelId, buildSelection, providerById, selectableModels } from "../workspace-creator/provider-selection";
import type { OpenMenu, PaseoClient } from "../workspace-creator/types";
import { useProviderCatalog } from "../workspace-creator/useProviderCatalog";
import { SharedComposerInput } from "./SharedComposerInput";
import { ResizeHandle } from "./ResizeHandle";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { ensureSelection } from "../workspace-creator/submit-workspace";
import type { PastedImage } from "../web";

interface AgentCreatorPanelProps {
  workspace: WorkspaceEntry;
  paseo: PaseoClient;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  initialPanelWidth?: number;
  maxPanelWidth?: number;
  onClose: () => void;
  onCreated: (agent: { id: string }) => void;
}

export function AgentCreatorPanel({ workspace, paseo, theme, compact, initialPanelWidth = 480, maxPanelWidth = 800, onClose, onCreated }: AgentCreatorPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [images, setImages] = useState<PastedImage[]>([]);
  const keyboardInset = useKeyboardInset(compact);
  const { snapshot, selection, setSelection, loading, error: providerError } = useProviderCatalog(
    paseo,
    workspace.workspaceDirectory,
  );
  const branchLabel = workspace.gitRuntime?.currentBranch?.replace(/^heads\//, "") ?? workspace.name;

  const selectModel = useCallback((combinedId: string) => {
    const separator = combinedId.indexOf("::");
    const providerId = separator >= 0 ? combinedId.slice(0, separator) : selection?.providerId ?? "";
    const modelId = separator >= 0 ? combinedId.slice(separator + 2) : combinedId;
    const entry = providerById(snapshot, providerId);
    const model = selectableModels(entry).find((item) => item.id === modelId);
    if (entry && model) setSelection(buildSelection(entry, model));
    setOpenMenu(null);
  }, [selection?.providerId, setSelection, snapshot]);

  const selectMode = useCallback((modeId: string) => {
    const entry = providerById(snapshot, selection?.providerId ?? "");
    const mode = entry?.modes?.find((item) => item.id === modeId);
    setSelection((current) => current ? { ...current, modeId, modeLabel: mode?.label ?? modeId } : current);
    setOpenMenu(null);
  }, [selection?.providerId, setSelection, snapshot]);

  const selectThinking = useCallback((thinkingOptionId: string) => {
    const entry = providerById(snapshot, selection?.providerId ?? "");
    const model = selectableModels(entry).find((item) => item.id === selection?.modelId);
    const thinking = model?.thinkingOptions?.find((item) => item.id === thinkingOptionId);
    setSelection((current) => current ? { ...current, thinkingOptionId, thinkingLabel: thinking?.label ?? thinkingOptionId } : current);
    setOpenMenu(null);
  }, [selection?.modelId, selection?.providerId, setSelection, snapshot]);

  const submit = useCallback(async () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt && images.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const resolvedSelection = await ensureSelection({
        paseo,
        projectDirectory: workspace.workspaceDirectory,
        snapshot,
        selection,
      });
      setSelection(resolvedSelection);
      const agent = await paseo.workspaces.ref(workspace.id).agents.create({
        config: {
          provider: providerModelId(resolvedSelection),
          ...(resolvedSelection.modeId ? { modeId: resolvedSelection.modeId } : {}),
          ...(resolvedSelection.thinkingOptionId ? { thinkingOptionId: resolvedSelection.thinkingOptionId } : {}),
        },
        prompt: nextPrompt,
        images: images.map(({ data, mimeType }) => ({ data, mimeType })),
      });
      setPrompt("");
      setImages([]);
      onCreated(agent);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setPending(false);
    }
  }, [images, onCreated, paseo, prompt, selection, setSelection, snapshot, workspace.id, workspace.workspaceDirectory]);

  const styles = useMemo(() => ({
    panel: { height: "100%", borderLeftWidth: 1, borderLeftColor: theme.colors.foregroundMuted + "22", backgroundColor: theme.colors.surface0 } as ViewStyle,
    header: { height: 54, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.foregroundMuted + "22" } as ViewStyle,
    title: { flex: 1, color: theme.colors.foreground, fontSize: 14, fontWeight: "600" } as TextStyle,
    subtitle: { color: theme.colors.foregroundMuted, fontSize: 11 } as TextStyle,
    close: { width: 30, height: 30, alignItems: "center", justifyContent: "center" } as ViewStyle,
    body: { flex: 1, justifyContent: "flex-end", paddingHorizontal: compact ? 12 : 20, paddingBottom: compact ? 12 + keyboardInset : 20 } as ViewStyle,
    error: { color: (theme.colors as { statusDanger?: string }).statusDanger ?? "#ef4444", fontSize: 12, marginTop: 8 } as TextStyle,
  }), [compact, keyboardInset, theme]);

  const content = <>
    <View style={styles.header}>
      <Icon name="Plus" size={17} color={theme.colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.title}>新建 Agent</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{branchLabel}</Text>
      </View>
      <Pressable accessibilityLabel="关闭新建 Agent" disabled={pending} onPress={onClose} style={styles.close}>
        <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
      </Pressable>
    </View>
    <View style={styles.body}>
      <SharedComposerInput
        selection={selection}
        snapshot={snapshot}
        providerLoading={loading}
        openMenu={openMenu}
        onToggleMenu={setOpenMenu}
        onSelectModel={selectModel}
        onSelectMode={selectMode}
        onSelectThinking={selectThinking}
        isAgentRunning={false}
        isCancelling={false}
        onCancel={() => {}}
        placeholder="给新 Agent 发第一条消息"
        theme={theme}
        disabled={pending}
        autoFocus
        inputNativeID="agent-create-prompt"
        pendingLabel={pending ? "Creating" : null}
        value={prompt}
        onChangeText={setPrompt}
        onSubmit={submit}
        images={images}
        onImagesChange={setImages}
        onPasteError={setError}
      />
      {error ?? providerError ? <Text style={styles.error}>{error ?? providerError}</Text> : null}
    </View>
  </>;

  if (compact) {
    return <View style={[styles.panel, { flex: 1, width: "100%" }]}>{content}</View>;
  }
  return <ResizeHandle theme={theme} side="left" variant="grip" initialWidth={initialPanelWidth} minWidth={360} maxWidth={maxPanelWidth} style={styles.panel}>{content}</ResizeHandle>;
}
