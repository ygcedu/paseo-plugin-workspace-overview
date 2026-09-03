import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PLUGIN_ID = "workspace-overview";

function getModuleDirectory(): string | null {
  const metaUrl = (import.meta as { url?: string }).url;
  if (typeof metaUrl === "string" && metaUrl.length > 0) {
    return dirname(fileURLToPath(metaUrl));
  }

  const stack = new Error().stack ?? "";
  const match = stack.match(/\(?((?:\/[^():]+)+\/auto-commit-impl\.server\.[tj]s)/);
  return match ? dirname(match[1]) : null;
}

function isPluginGitDirectory(directory: string): boolean {
  return existsSync(join(directory, "paseo-plugin.json")) && existsSync(join(directory, ".git"));
}

function findPluginGitDirectoryFromCandidates(): string | null {
  const moduleDirectory = getModuleDirectory();
  const candidates = [moduleDirectory, process.cwd()].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    let directory = candidate;
    const root = parse(directory).root;
    while (directory && directory !== root) {
      if (isPluginGitDirectory(directory)) {
        return directory;
      }
      directory = dirname(directory);
    }
  }
  return null;
}

async function findPluginGitDirectoryFromPaseoCli(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("paseo", ["plugin", "ls"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim().startsWith(PLUGIN_ID)) continue;
      const columns = line.trim().split(/\s{2,}/);
      const directory = columns.find((value) => value.startsWith("/"));
      if (directory && isPluginGitDirectory(directory)) return directory;
    }
  } catch {
    return null;
  }
  return null;
}

async function findPluginGitDirectory(): Promise<string> {
  const directory =
    findPluginGitDirectoryFromCandidates() ??
    (await findPluginGitDirectoryFromPaseoCli());
  if (!directory) {
    throw new Error(`找不到 ${PLUGIN_ID} 插件的 git 目录`);
  }
  return directory;
}

async function runGit(projectDirectory: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", projectDirectory, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function tryGit(projectDirectory: string, args: string[]): Promise<string | null> {
  try {
    return await runGit(projectDirectory, args);
  } catch {
    return null;
  }
}

export async function readAutoCommitInfo(): Promise<{
  cwd: string;
  currentBranch: string | null;
  hasChanges: boolean;
  status: string;
  recentMessages: string[];
}> {
  const projectDirectory = await findPluginGitDirectory();
  const [status, currentBranch, log] = await Promise.all([
    runGit(projectDirectory, ["status", "--short"]),
    tryGit(projectDirectory, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    tryGit(projectDirectory, ["log", "--format=%s", "-8"]),
  ]);

  return {
    cwd: projectDirectory,
    currentBranch,
    hasChanges: status.length > 0,
    status,
    recentMessages: (log ?? "").split("\n").filter(Boolean),
  };
}
