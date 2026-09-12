import type { PluginServerContext } from "@getpaseo/plugin/server";
import { projectIconRpc } from "./shared/project-icon";
import { readPaseoProjectIcon } from "./server/project-icon-impl";
import { gitBranchesRpc } from "./shared/git-branches";
import { readGitBranches } from "./server/git-branches-impl";
import { terminalLaunchRpc } from "./shared/terminal-launch";
import { launchWorkspaceTerminal } from "./server/terminal-launch-impl";
import { autoCommitInfoRpc, autoCommitStartRpc, autoCommitStatusRpc } from "./shared/auto-commit";
import { readAutoCommitInfo, readAutoCommitTaskStatus, startAutoCommitTask } from "./server/auto-commit-impl";
import { agentConfigSetRpc } from "./shared/agent-config";
import { closeAgentConfigClient, setAgentConfig } from "./server/agent-config-impl";

export default function contribute(server: PluginServerContext) {
  server.handle(projectIconRpc, async ({ projectId, projectDirectory }) => ({
    dataUri: await readPaseoProjectIcon(projectId, projectDirectory),
  }));

  server.handle(gitBranchesRpc, async ({ projectDirectory }) =>
    readGitBranches(projectDirectory),
  );

  server.handle(terminalLaunchRpc, launchWorkspaceTerminal);

  server.handle(autoCommitInfoRpc, readAutoCommitInfo);
  server.handle(autoCommitStartRpc, startAutoCommitTask);
  server.handle(autoCommitStatusRpc, ({ taskId }) => readAutoCommitTaskStatus(taskId));
  server.handle(agentConfigSetRpc, setAgentConfig);

  return () => closeAgentConfigClient();
}
