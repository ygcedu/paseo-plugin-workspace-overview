import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function buildAgentDeepLinkUrl(serverId: string, agentId: string): string {
  return `paseo://h/${encodeURIComponent(serverId)}/agent/${encodeURIComponent(agentId)}`;
}

function findDesktopApp(): string | null {
  if (process.platform === "linux") {
    const candidates = [
      "/usr/bin/Paseo",
      "/opt/Paseo/Paseo",
      path.join(homedir(), "Applications", "Paseo.AppImage"),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return null;
    const candidate = path.join(localAppData, "Programs", "Paseo", "Paseo.exe");
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

export function openDeepLinkInDesktop(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];
    if (process.platform === "darwin") {
      // `open <url>` hands the paseo:// URL to LaunchServices, which delivers it
      // to the *running* app's `open-url` event (main.ts → receiveAgentDeepLink).
      // No second instance is spawned, so there is no flicker. Avoid `-n -a
      // <app> --args <url>` here: that second-instance relay spawns a throwaway
      // process that quits immediately, which shows up as a flashing window.
      command = "open";
      args = [url];
    } else {
      const desktopApp = findDesktopApp();
      if (!desktopApp) {
        reject(new Error("Paseo desktop app not found"));
        return;
      }
      command = desktopApp;
      args = [url];
    }

    // Match the CLI's desktop-launch env hygiene: the daemon plugin process
    // inherits ELECTRON_* vars that must not leak into a spawned desktop app.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    delete env.PASEO_NODE_ENV;

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      env,
    });
    child.on("error", reject);
    child.unref();
    // `open` returns immediately; treat successful spawn as success.
    resolve();
  });
}
