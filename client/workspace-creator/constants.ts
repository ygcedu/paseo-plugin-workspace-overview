import type { OpenMenu, TerminalProfile } from "./types";

export const PROVIDER_READY_TIMEOUT_MS = 10_000;
export const MAX_MENU_HEIGHT = 260;
export const MENU_WIDTH_BY_KIND: Record<Exclude<OpenMenu, null>, number> = {
  project: 360, host: 240, isolation: 220, base: 240, launch: 260,
  provider: 260, model: 340, mode: 220, thinking: 240,
};
export const DEFAULT_TERMINAL_PROFILES: TerminalProfile[] = [
  { id: "claude", name: "Claude Code", command: "claude", args: ["{{{prompt}}}"], icon: "claude" },
  { id: "codex", name: "Codex", command: "codex", args: ["{{{prompt}}}"], icon: "codex" },
  { id: "opencode", name: "OpenCode", command: "opencode", args: ["--prompt={{{prompt}}}"], icon: "opencode" },
  { id: "pi", name: "Pi", command: "pi", args: ["{{{prompt}}}"], icon: "pi" },
];
