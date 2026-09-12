import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { WorkspaceCreateComposer } from "./WorkspaceCreateComposer";
import { ResizeHandle } from "./ResizeHandle";
import { buildSelection, submitWorkspacePrompt, defaultSelection, providerById, PROVIDER_READY_TIMEOUT_MS, readPaseoProviderModelPreference, selectableModels, type ComposerSelection, type Isolation, type LaunchTarget, type OpenMenu, type ProviderSnapshot, type TerminalProfile, type WorkspaceCreatorPanelProps } from "./workspace-creator-shared";
import { terminalLaunchRpc } from "../../shared/terminal-launch";

const DEFAULT_TERMINAL_PROFILES: TerminalProfile[] = [
  { id: "claude", name: "Claude Code", command: "claude", args: ["{{{prompt}}}"], icon: "claude" },
  { id: "codex", name: "Codex", command: "codex", args: ["{{{prompt}}}"], icon: "codex" },
  { id: "opencode", name: "OpenCode", command: "opencode", args: ["--prompt={{{prompt}}}"], icon: "opencode" },
  { id: "pi", name: "Pi", command: "pi", args: ["{{{prompt}}}"], icon: "pi" },
];

export function WorkspaceCreatorPanel({
  projectId,
  projectDisplayName,
  projectDirectory,
  hostLabel,
  hostId,
  navigation,
  projects,
  paseo,
  onClose,
  onCreate,
  theme,
  layout,
}: WorkspaceCreatorPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null);
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [isolation, setIsolation] = useState<Isolation>("worktree");
  const [baseBranch, setBaseBranch] = useState(() => {
    const initialProject = projects.find((project) => project.projectId === projectId);
    return initialProject?.defaultBranch ?? initialProject?.branches[0]?.id ?? "main";
  });
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget>({ kind: "chat" });
  const [terminalProfiles, setTerminalProfiles] = useState<TerminalProfile[]>(DEFAULT_TERMINAL_PROFILES);
  const launchTerminal = useRpc(terminalLaunchRpc);

  useEffect(() => {
    let cancelled = false;
    void paseo.config.get().then(({ config }: { config: { terminalProfiles?: Array<{ id: string; name: string; command: string; args?: string[]; icon?: string }> } }) => {
      if (cancelled || !Array.isArray(config.terminalProfiles)) return;
      setTerminalProfiles(
        config.terminalProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          command: profile.command,
          args: profile.args ?? [],
          icon: profile.icon,
        })),
      );
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [paseo]);

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.projectId === selectedProjectId) ?? {
        projectId,
        projectDisplayName,
        projectDirectory: projectDirectory ?? "",
        branches: [{ id: "main", label: "main", detail: "本地分支" }],
        defaultBranch: "main",
      },
    [projectDirectory, projectDisplayName, projectId, projects, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProject.projectDirectory) return;
    let cancelled = false;
    setProviderLoading(true);
    setError(null);
    const loadProviders = async (): Promise<ProviderSnapshot> => {
      const initial = await paseo.providers.snapshot({ cwd: selectedProject.projectDirectory }) as ProviderSnapshot;
      const entries = await Promise.all(initial.entries.map(async (entry) => {
        if (entry.enabled === false) return entry;
        const provider = entry.provider as Parameters<typeof paseo.providers.listModels>[0];
        const [modelsResult, modesResult] = await Promise.allSettled([
          paseo.providers.listModels(provider, { cwd: selectedProject.projectDirectory }),
          paseo.providers.listModes(provider, { cwd: selectedProject.projectDirectory }),
        ]);
        const models = modelsResult.status === "fulfilled" ? modelsResult.value.models : entry.models;
        const modes = modesResult.status === "fulfilled" ? modesResult.value.modes : entry.modes;
        return {
          ...entry,
          status: models?.length ? "ready" : entry.status,
          models,
          modes,
          defaultModeId: entry.defaultModeId,
        };
      }));
      return { ...initial, entries };
    };
    void Promise.race([
      loadProviders(),
      paseo.providers.waitForReady({ cwd: selectedProject.projectDirectory, timeoutMs: PROVIDER_READY_TIMEOUT_MS }) as Promise<ProviderSnapshot>,
    ])
      .then((nextSnapshot: ProviderSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setSelection((current) => {
          if (current) return current;
          return defaultSelection(nextSnapshot, readPaseoProviderModelPreference());
        });
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

  const selectProject = useCallback(
    (nextProjectId: string) => {
      const nextProject = projects.find((project) => project.projectId === nextProjectId);
      if (!nextProject) return;
      setSelectedProjectId(nextProjectId);
      setBaseBranch(
        nextProject.branches.some((branch) => branch.id === baseBranch)
          ? baseBranch
          : nextProject.defaultBranch ?? nextProject.branches[0]?.id ?? "main",
      );
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
    }, prompt);
    if (submitted) setPrompt("");
  },
    [baseBranch, hostId, isolation, launchTarget, launchTerminal, navigation, onClose, onCreate, paseo, prompt, selectedProject, selection, snapshot, terminalProfiles],
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
      paddingBottom: layout.compact ? 12 : 20,
    } as ViewStyle,
  }), [layout.compact, theme]);

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
          hostLabel={hostLabel}
          projects={projects}
          isolation={isolation}
          baseBranch={baseBranch}
          pending={pending}
          error={error}
          providerLoading={providerLoading}
          snapshot={snapshot}
          selection={selection}
          launchTarget={launchTarget}
          terminalProfiles={terminalProfiles}
          openMenu={openMenu}
          onToggleMenu={setOpenMenu}
          onSelectProject={selectProject}
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
      initialWidth={480}
      minWidth={360}
      maxWidth={800}
      style={panelStyles.panel}
    >
      {content}
    </ResizeHandle>
  );
}
