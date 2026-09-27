import React, { useCallback, useMemo, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { WorkspaceCreateComposer } from "./WorkspaceCreateComposer";
import { ResizeHandle } from "./ResizeHandle";
import { buildSelection, providerById, selectableModels } from "../workspace-creator/provider-selection";
import { submitWorkspacePrompt } from "../workspace-creator/submit-workspace";
import type { Isolation, LaunchTarget, OpenMenu, WorkspaceCreatorPanelProps } from "../workspace-creator/types";
import { terminalLaunchRpc } from "../../shared/terminal-launch";
import { useProviderCatalog, useTerminalProfiles } from "../workspace-creator/useProviderCatalog";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import type { PastedImage } from "../web";

export function WorkspaceCreatorPanel({
  projectId,
  projectDisplayName,
  projectDirectory,
  hostId,
  navigation,
  projects,
  paseo,
  onClose,
  onCreate,
  initialPanelWidth = 480,
  maxPanelWidth = 800,
  theme,
  layout,
}: WorkspaceCreatorPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<PastedImage[]>([]);
  const [isolation, setIsolation] = useState<Isolation>("worktree");
  const [baseBranch, setBaseBranch] = useState(() => {
    const initialProject = projects.find((project) => project.projectId === projectId);
    return initialProject?.defaultBranch ?? initialProject?.branches[0]?.id ?? "main";
  });
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget>({ kind: "chat" });
  const launchTerminal = useRpc(terminalLaunchRpc);
  const keyboardInset = useKeyboardInset(layout.compact);

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectId === projectId) ?? {
        projectId,
        projectDisplayName,
        projectDirectory: projectDirectory ?? "",
        branches: [{ id: "main", label: "main", detail: "本地分支" }],
        defaultBranch: "main",
      },
    [projectDirectory, projectDisplayName, projectId, projects],
  );
  const terminalProfiles = useTerminalProfiles(paseo);
  const providerCatalog = useProviderCatalog(paseo, selectedProject.projectDirectory);
  const { snapshot, selection, setSelection, loading: providerLoading } = providerCatalog;
  const visibleError = error ?? providerCatalog.error;

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

  const submit = useCallback(async () => {
    const submitted = await submitWorkspacePrompt({
        project: selectedProject.projectDirectory ? selectedProject : null,
        isolation,
        baseBranch,
        paseo,
        snapshot,
        selection,
        launchTarget,
        terminalProfiles,
        launchTerminal,
        openAgent: (agentId) => navigation.openAgent({ agentId }),
        serverId: hostId,
        setSelection,
        setPending,
        setError,
        onDone: () => {
          onCreate?.();
          onClose();
        },
        images,
    }, prompt);
    if (submitted) {
      setPrompt("");
      setImages([]);
    }
  },
    [baseBranch, hostId, images, isolation, launchTarget, launchTerminal, navigation, onClose, onCreate, paseo, prompt, selectedProject, selection, snapshot, terminalProfiles],
  );

  const close = useCallback(() => {
    if (pending) return;
    setOpenMenu(null);
    setError(null);
    onClose();
  }, [onClose, pending]);

  const panelStyles = useMemo(() => ({
    panel: {
      height: "100%",
      borderLeftWidth: 1,
      borderLeftColor: theme.colors.foregroundMuted + "22",
      backgroundColor: theme.colors.surface0,
    } as ViewStyle,
    header: {
      height: 54,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.foregroundMuted + "22",
    } as ViewStyle,
    title: {
      flex: 1,
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "600",
    } as TextStyle,
    closeButton: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    body: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: layout.compact ? 12 : 20,
      paddingBottom: layout.compact ? 12 + keyboardInset : 20,
    } as ViewStyle,
  }), [keyboardInset, layout.compact, theme]);

  const content = (
    <>
      <View style={panelStyles.header}>
        <Icon name="Plus" size={17} color={theme.colors.foregroundMuted} />
        <Text numberOfLines={1} style={panelStyles.title}>新建 Workspace</Text>
        <Pressable accessibilityLabel="关闭新建 Workspace" disabled={pending} onPress={close} style={panelStyles.closeButton}>
          <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <View style={panelStyles.body}>
        <WorkspaceCreateComposer
          project={selectedProject.projectDirectory ? selectedProject : null}
          isolation={isolation}
          baseBranch={baseBranch}
          pending={pending}
          error={visibleError}
          providerLoading={providerLoading}
          snapshot={snapshot}
          selection={selection}
          launchTarget={launchTarget}
          terminalProfiles={terminalProfiles}
          openMenu={openMenu}
          onToggleMenu={setOpenMenu}
          onSelectIsolation={selectIsolation}
          onSelectBase={selectBase}
          onSelectModel={selectModel}
          onSelectMode={selectMode}
          onSelectThinking={selectThinking}
          onSelectLaunchTarget={(target) => {
            setLaunchTarget(target);
            setOpenMenu(null);
          }}
          theme={theme}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={submit}
          compact={layout.compact}
          images={launchTarget.kind === "chat" ? images : []}
          onImagesChange={launchTarget.kind === "chat" ? setImages : () => {}}
        />
      </View>
    </>
  );

  if (layout.compact) {
    return <View style={[panelStyles.panel, { flex: 1, width: "100%" }]}>{content}</View>;
  }

  return (
    <ResizeHandle
      theme={theme}
      side="left"
      variant="grip"
      initialWidth={initialPanelWidth}
      minWidth={360}
      maxWidth={maxPanelWidth}
      style={panelStyles.panel}
    >
      {content}
    </ResizeHandle>
  );
}
