import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROMPT_SENTINEL = "{{{prompt}}}";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resolveProfileCommand(profile: { command: string; args: string[] }, prompt: string): string {
  const replacePrompt = (value: string) => value.split(PROMPT_SENTINEL).join(prompt);
  const args = profile.args.flatMap((arg) => {
    const promptOnly = arg === PROMPT_SENTINEL || arg.endsWith(`=${PROMPT_SENTINEL}`);
    return !prompt && promptOnly ? [] : [replacePrompt(arg)];
  });
  return [replacePrompt(profile.command), ...args].map(shellQuote).join(" ");
}

function findTerminalId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  for (const nested of Object.values(record)) {
    const id = findTerminalId(nested);
    if (id) return id;
  }
  return null;
}

export async function launchWorkspaceTerminal(input: {
  workspaceDirectory: string;
  workspaceId: string;
  serverId: string;
  prompt: string;
  profile: { name: string; command: string; args: string[] } | null;
}): Promise<{ terminalId: string }> {
  const createArgs = ["terminal", "create", "--cwd", input.workspaceDirectory, "--json"];
  if (input.profile?.name) createArgs.push("--name", input.profile.name);
  const { stdout } = await execFileAsync("paseo", createArgs, { encoding: "utf8" });
  const terminalId = findTerminalId(JSON.parse(stdout));
  if (!terminalId) throw new Error("Paseo did not return the created terminal id");

  const line = input.profile
    ? resolveProfileCommand(input.profile, input.prompt.trim())
    : input.prompt.trim();
  if (line) {
    await execFileAsync(
      "paseo",
      ["terminal", "send-keys", "--literal", terminalId, `${line}\r`, "--json"],
      { encoding: "utf8" },
    );
  }

  return { terminalId };
}
