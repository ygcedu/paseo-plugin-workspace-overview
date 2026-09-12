import { PROVIDER_READY_TIMEOUT_MS } from "./constants";
import { defaultSelection, providerModelId } from "./provider-selection";
import type { ComposerSelection, Isolation, LaunchTarget, PaseoClient, ProviderSnapshot, TerminalProfile, WorkspaceProjectOption } from "./types";

function createWorktreeSlug(): string { return `workspace-${Date.now().toString(36)}`; }

export async function ensureSelection(input: { paseo: PaseoClient; projectDirectory: string; snapshot: ProviderSnapshot | null; selection: ComposerSelection | null }): Promise<ComposerSelection> {
  if (input.selection) return input.selection;
  const snapshot = input.snapshot ?? await input.paseo.providers.waitForReady({ cwd: input.projectDirectory, timeoutMs: PROVIDER_READY_TIMEOUT_MS });
  const selection = defaultSelection(snapshot);
  if (!selection) throw new Error("没有可用的 provider");
  return selection;
}

function workspaceSource(project: WorkspaceProjectOption, isolation: Isolation, baseBranch: string) {
  return isolation === "worktree"
    ? { kind: "worktree" as const, cwd: project.projectDirectory, projectId: project.projectId, worktreeSlug: createWorktreeSlug(), action: "branch-off" as const, baseBranch }
    : { kind: "directory" as const, path: project.projectDirectory, projectId: project.projectId };
}

interface SubmitWorkspaceInput {
  project: WorkspaceProjectOption | null; isolation: Isolation; baseBranch: string; paseo: PaseoClient;
  snapshot: ProviderSnapshot | null; selection: ComposerSelection | null; launchTarget: LaunchTarget;
  terminalProfiles: TerminalProfile[];
  launchTerminal: (input: { workspaceDirectory: string; workspaceId: string; serverId: string; prompt: string; profile: { name: string; command: string; args: string[] } | null }) => Promise<{ terminalId: string }>;
  openAgent: (agentId: string) => void | Promise<unknown>; serverId: string;
  setSelection: (selection: ComposerSelection) => void; setPending: (pending: boolean) => void;
  setError: (error: string | null) => void; onDone: () => void;
}

export async function submitWorkspacePrompt(input: SubmitWorkspaceInput, rawPrompt: string): Promise<boolean> {
  const prompt = rawPrompt.trim();
  if (!prompt || !input.project) return false;
  input.setPending(true); input.setError(null);
  try {
    const source = workspaceSource(input.project, input.isolation, input.baseBranch);
    if (input.launchTarget.kind === "terminal") {
      const profileId = input.launchTarget.profileId;
      const workspace = await input.paseo.workspaces.create({ source });
      const current = workspace.current() ?? await workspace.refresh();
      const workspaceDirectory = current?.workspaceDirectory ?? workspace.directory;
      if (!workspaceDirectory) throw new Error("创建的 Workspace 没有可用目录");
      const profile = profileId === "blank" ? null : input.terminalProfiles.find((item) => item.id === profileId) ?? null;
      await input.launchTerminal({ workspaceDirectory, workspaceId: workspace.id, serverId: input.serverId, prompt, profile: profile ? { name: profile.name, command: profile.command, args: profile.args } : null });
    } else {
      const selection = await ensureSelection({ paseo: input.paseo, projectDirectory: input.project.projectDirectory, snapshot: input.snapshot, selection: input.selection });
      input.setSelection(selection);
      const workspace = await input.paseo.workspaces.create({ source, firstAgentContext: { prompt } });
      const agent = await workspace.agents.create({
        config: { provider: providerModelId(selection), ...(selection.modeId ? { modeId: selection.modeId } : {}), ...(selection.thinkingOptionId ? { thinkingOptionId: selection.thinkingOptionId } : {}) },
        prompt,
      });
      await input.openAgent(agent.id);
    }
    input.onDone();
    return true;
  } catch (error) {
    input.setError(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    input.setPending(false);
  }
}
