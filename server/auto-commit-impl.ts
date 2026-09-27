import { execFile, spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PLUGIN_ID = "workspace-overview";
const PI_MODEL = "9router/coding";

interface AutoCommitTask {
  taskId: string;
  cwd: string;
  status: "running" | "done" | "error";
  output: string;
  error: string | null;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
}

const tasks = new Map<string, AutoCommitTask>();
const startingDirectories = new Set<string>();

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
  return readAutoCommitInfoForDirectory(projectDirectory);
}

async function readAutoCommitInfoForDirectory(projectDirectory: string): Promise<{
  cwd: string;
  currentBranch: string | null;
  hasChanges: boolean;
  status: string;
  recentMessages: string[];
}> {
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

function buildAutoCommitPrompt() {
  return [
    "请帮我提交当前仓库里的待提交改动。",
    "",
    "你自己判断怎么提交：可以是一个 commit，也可以根据改动内容拆成多个 commit。",
    "",
    "请先用 git 查看最近几条 commit message，参考这个仓库已有的 message 风格。",
    "然后自己阅读当前所有待提交代码，包括已修改文件和还没被 git 管理的新文件，理解改动内容后再提交。",
    "",
    "不要 push，也不要丢弃用户改动。",
  ].join("\n");
}

function appendTaskOutput(task: AutoCommitTask, chunk: Buffer | string) {
  task.output = `${task.output}${chunk.toString()}`.slice(-20_000);
}

function scheduleTaskCleanup(taskId: string) {
  const timer = setTimeout(() => tasks.delete(taskId), 10 * 60_000);
  timer.unref();
}

export async function startAutoCommitTask({ cwd }: { cwd: string }): Promise<{ taskId: string; cwd: string }> {
  const directory = await realpath(cwd);
  const running = [...tasks.values()].find((task) => task.cwd === directory && task.status === "running");
  if (running) return { taskId: running.taskId, cwd: running.cwd };
  if (startingDirectories.has(directory)) throw new Error("当前仓库正在启动提交任务，请稍后重试");
  startingDirectories.add(directory);
  try {
    const info = await readAutoCommitInfoForDirectory(directory);
    if (!info.hasChanges) {
      throw new Error("没有待提交改动");
    }

    const task: AutoCommitTask = {
      taskId: randomUUID(),
      cwd: info.cwd,
      status: "running",
      output: "",
      error: null,
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    tasks.set(task.taskId, task);

    const child = spawn("pi", ["--model", PI_MODEL, "--approve", "-p", buildAutoCommitPrompt()], {
      cwd: info.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => appendTaskOutput(task, chunk));
    child.stderr.on("data", (chunk) => appendTaskOutput(task, chunk));
    child.on("error", (error) => {
      task.status = "error";
      task.error = error.message;
      task.finishedAt = new Date().toISOString();
      scheduleTaskCleanup(task.taskId);
    });
    child.on("close", (code) => {
      task.exitCode = code;
      task.status = code === 0 ? "done" : "error";
      task.error = code === 0 ? null : task.error ?? `pi 进程退出，exit code ${code}`;
      task.finishedAt = new Date().toISOString();
      scheduleTaskCleanup(task.taskId);
    });

    return { taskId: task.taskId, cwd: task.cwd };
  } finally {
    startingDirectories.delete(directory);
  }
}

export function readAutoCommitTaskStatus(taskId: string): AutoCommitTask {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`找不到一键提交任务: ${taskId}`);
  return task;
}
