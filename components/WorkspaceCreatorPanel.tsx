import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react-native";
import { useRpc } from "@getpaseo/plugin";
import { WorkspaceCreateComposer } from "./WorkspaceCreateComposer";
import { buildSelection, createWorkspaceChatModel, defaultSelection, providerById, PROVIDER_READY_TIMEOUT_MS, readPaseoProviderModelPreference, selectableModels, type ComposerSelection, type Isolation, type LaunchTarget, type OpenMenu, type ProviderSnapshot, type TerminalProfile, type WorkspaceCreatorPanelProps } from "./workspace-creator-shared";
import { terminalLaunchRpc } from "../shared/terminal-launch";

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
}: WorkspaceCreatorPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerLoading, setProviderLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null);
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
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
    void paseo.providers
      .waitForReady({ cwd: selectedProject.projectDirectory, timeoutMs: PROVIDER_READY_TIMEOUT_MS })
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

  const chatModel = useMemo(
    () =>
      createWorkspaceChatModel({
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
      }),
    [baseBranch, hostId, isolation, launchTarget, launchTerminal, navigation, onClose, onCreate, paseo, selectedProject, selection, snapshot, terminalProfiles],
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
        launchTarget={launchTarget}
        terminalProfiles={terminalProfiles}
        openMenu={openMenu}
        onClose={close}
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
      />
    </AssistantRuntimeProvider>
  );
}
