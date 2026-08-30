import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface GitBranchItem {
  id: string;
  label: string;
  detail: string;
}

async function runGit(projectDirectory: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectDirectory, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function readGitBranches(projectDirectory: string): Promise<{
  currentBranch: string | null;
  defaultBranch: string | null;
  branches: GitBranchItem[];
}> {
  const [refsOutput, currentBranchOutput, originHeadOutput] = await Promise.all([
    runGit(projectDirectory, [
      "for-each-ref",
      "--format=%(refname)%09%(refname:short)",
      "refs/heads",
      "refs/remotes",
    ]),
    runGit(projectDirectory, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runGit(projectDirectory, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD",
    ]),
  ]);

  const branches = (refsOutput ?? "")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([refName, shortName]) =>
      Boolean(refName && shortName && !refName.endsWith("/HEAD")),
    )
    .map(([refName, shortName]) => ({
      id: shortName,
      label: shortName,
      detail: refName.startsWith("refs/heads/") ? "本地分支" : "远程分支",
    }));

  const localBranchIds = new Set(
    branches.filter((branch) => branch.detail === "本地分支").map((branch) => branch.id),
  );
  const remoteDefault = originHeadOutput?.replace(/^origin\//, "") ?? null;
  const defaultBranch =
    currentBranchOutput ??
    (remoteDefault && localBranchIds.has(remoteDefault) ? remoteDefault : originHeadOutput) ??
    (localBranchIds.has("main") ? "main" : null) ??
    (localBranchIds.has("master") ? "master" : null) ??
    branches[0]?.id ??
    null;

  branches.sort((left, right) => {
    if (left.id === currentBranchOutput) return -1;
    if (right.id === currentBranchOutput) return 1;
    if (left.detail !== right.detail) return left.detail === "本地分支" ? -1 : 1;
    return left.label.localeCompare(right.label);
  });

  return {
    currentBranch: currentBranchOutput,
    defaultBranch,
    branches,
  };
}
