import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const ICON_NAMES = [
  "favicon.svg",
  "favicon.png",
  "favico.svg",
  "favico.png",
  "icon.svg",
  "icon.png",
  "app-icon.svg",
  "app-icon.png",
  "apple-touch-icon.png",
  "logo.svg",
  "logo.png",
  "favicon.ico",
];

const ICON_DIRECTORIES = ["public", "static", "priv/static", "assets", "images", "img", ""];
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".output", "coverage", ".cache", "vendor"]);

function mimeType(bytes: Buffer, filePath: string): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("utf8", 0, 256).includes("<svg") || path.extname(filePath).toLowerCase() === ".svg") return "image/svg+xml";
  if (path.extname(filePath).toLowerCase() === ".ico") return "image/x-icon";
  return null;
}

async function readIcon(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath);
    const mime = mimeType(bytes, filePath);
    return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

function iconNameMatches(name: string): boolean {
  return ICON_NAMES.includes(name.toLowerCase()) || /^(favicon-|apple-touch-icon-|icon-|android-chrome-|mstile-).+\.(svg|png)$/i.test(name);
}

async function findIconInDirectory(directory: string): Promise<string | null> {
  try {
    const entries = await readdir(directory);
    const ordered = [
      ...ICON_NAMES.flatMap((name) => entries.filter((entry) => entry.toLowerCase() === name)),
      ...entries.filter(iconNameMatches),
    ];
    for (const entry of [...new Set(ordered)]) {
      const icon = await readIcon(path.join(directory, entry));
      if (icon) return icon;
    }
  } catch {
    // Missing optional directory.
  }
  return null;
}

async function findIconRecursively(directory: string, depth: number): Promise<string | null> {
  const direct = await findIconInDirectory(directory);
  if (direct || depth <= 0) return direct;
  try {
    const entries = await readdir(directory);
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;
      const child = path.join(directory, entry);
      try {
        if (!(await stat(child)).isDirectory()) continue;
      } catch {
        continue;
      }
      const icon = await findIconRecursively(child, depth - 1);
      if (icon) return icon;
    }
  } catch {
    // Unreadable directory.
  }
  return null;
}

export async function readPaseoProjectIcon(projectId: string, projectDirectory: string): Promise<string | null> {
  const paseoHome = process.env.PASEO_HOME?.trim() || path.join(homedir(), ".paseo");
  const key = createHash("sha256").update(projectId).digest("hex");
  const custom = await readIcon(path.join(paseoHome, "projects", "icons", `${key}.bin`));
  if (custom) return custom;

  for (const directory of ICON_DIRECTORIES) {
    const icon = await findIconRecursively(path.join(projectDirectory, directory), directory ? 2 : 0);
    if (icon) return icon;
  }
  for (const monorepoDirectory of ["packages", "apps"]) {
    const icon = await findIconRecursively(path.join(projectDirectory, monorepoDirectory), 3);
    if (icon) return icon;
  }
  return null;
}
