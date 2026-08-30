import React, { useMemo } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import type { AgentTimelineEntry } from "./agent-conversation-types";
import { PaseoStreamBadge } from "./PaseoStreamBadge";
import { PaseoTimelineItem } from "./PaseoTimelineItem";

function toolKind(entry: AgentTimelineEntry): "edit" | "command" | "read" | "search" | "paseo" | "other" {
  const item = entry.item;
  const detailType = item.detail?.type;
  const name = String(item.name ?? "").toLowerCase();
  if (name.startsWith("paseo_") || name.startsWith("mcp__paseo__")) return "paseo";
  if (detailType === "edit" || detailType === "write" || /apply[_-]?patch|edit|write/.test(name)) return "edit";
  if (detailType === "shell" || /exec|command|shell|terminal/.test(name)) return "command";
  if (detailType === "read" || /read|view[_-]?image/.test(name)) return "read";
  if (detailType === "search" || /search|find|grep|glob|web_search|llm_context/.test(name)) return "search";
  return "other";
}

function groupSummary(entries: AgentTimelineEntry[]): string {
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  const counts = { edit: 0, command: 0, read: 0, search: 0, paseo: 0, other: 0 };
  for (const entry of entries) {
    const kind = toolKind(entry);
    const path = entry.item.detail?.filePath ?? entry.item.detail?.path;
    if (kind === "edit" && typeof path === "string") editedFiles.add(path);
    else if (kind === "read" && typeof path === "string") readFiles.add(path);
    else counts[kind] += 1;
  }
  counts.edit += editedFiles.size;
  counts.read += readFiles.size;
  const parts: string[] = [];
  if (counts.edit) parts.push(`编辑了 ${counts.edit} 个文件`);
  if (counts.command) parts.push(`运行了 ${counts.command} 个命令`);
  if (counts.read) parts.push(`读取了 ${counts.read} 个文件`);
  if (counts.search) parts.push(`搜索了 ${counts.search} 次`);
  if (counts.other) parts.push(`使用了 ${counts.other} 个其他工具`);
  if (counts.paseo) parts.push(`调用了 Paseo ${counts.paseo} 次`);
  if (parts.length <= 1) return parts[0] ?? "使用了工具";
  return `${parts.slice(0, -1).join("，")}并${parts.at(-1)}`;
}

export function PaseoToolCallGroup({ entries, theme }: { entries: AgentTimelineEntry[]; theme: PluginSurfaceProps["theme"] }) {
  const summary = useMemo(() => groupSummary(entries), [entries]);
  const loading = entries.some((entry) => entry.item.status === "running" || entry.item.status === "executing");
  const error = entries.some((entry) => entry.item.status === "failed");
  return (
    <PaseoStreamBadge label={summary} icon="Wrench" loading={loading} error={error} theme={theme}>
      {entries.map((entry) => <PaseoTimelineItem key={`${entry.seqStart}:${entry.item.type}`} entry={entry} theme={theme} />)}
    </PaseoStreamBadge>
  );
}

