import React, { useMemo } from "react";
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { PaseoAssistantMessage } from "./PaseoAssistantMessage";

type ToolDetail = Record<string, any> & { type?: string };

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function CodePanel({ value, theme, diff = false }: { value: string; theme: PluginSurfaceProps["theme"]; diff?: boolean }) {
  return <ScrollView style={{ maxHeight: 420, backgroundColor: theme.colors.surface1 }} nestedScrollEnabled>
    <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ minWidth: "100%" }}>
      <View style={{ minWidth: "100%", paddingHorizontal: 12, paddingVertical: 10 }}>
        {value.split("\n").map((line, index) => {
          const added = diff && line.startsWith("+") && !line.startsWith("+++");
          const removed = diff && line.startsWith("-") && !line.startsWith("---");
          return <Text key={index} selectable style={{ color: added ? theme.colors.statusSuccess : removed ? theme.colors.statusDanger : theme.colors.foreground, backgroundColor: added ? theme.colors.statusSuccess + "18" : removed ? theme.colors.statusDanger + "18" : "transparent", fontFamily: "monospace", fontSize: 12, lineHeight: 18 }}>{line || " "}</Text>;
        })}
      </View>
    </ScrollView>
  </ScrollView>;
}

export function PaseoToolDetail({ detail, theme }: { detail: ToolDetail; theme: PluginSurfaceProps["theme"] }) {
  const styles = useMemo(() => ({
    root: { gap: 8, backgroundColor: theme.colors.surface1, padding: 10 } as ViewStyle,
    meta: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 } as TextStyle,
    label: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" } as TextStyle,
    result: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18 } as TextStyle,
    row: { gap: 3, paddingVertical: 4 } as ViewStyle,
  }), [theme]);

  if (detail.type === "plan") return <View style={styles.root}><PaseoAssistantMessage text={text(detail.text)} theme={theme} /></View>;
  if (detail.type === "read" || detail.type === "write") {
    const content = text(detail.content);
    return <View style={styles.root}><Text selectable style={styles.meta}>{detail.filePath}{detail.offset != null ? ` · lines ${detail.offset}${detail.limit ? `–${detail.offset + detail.limit}` : ""}` : ""}</Text>{content ? <CodePanel value={content} theme={theme} /> : null}</View>;
  }
  if (detail.type === "edit") {
    const diff = text(detail.unifiedDiff) || [text(detail.oldString).split("\n").map((line) => `-${line}`).join("\n"), text(detail.newString).split("\n").map((line) => `+${line}`).join("\n")].filter(Boolean).join("\n");
    return <View style={styles.root}><Text selectable style={styles.meta}>{detail.filePath}</Text>{diff ? <CodePanel value={diff} theme={theme} diff /> : null}</View>;
  }
  if (detail.type === "search") {
    const summary = [detail.numMatches != null ? `${detail.numMatches} matches` : null, detail.numFiles != null ? `${detail.numFiles} files` : null, detail.durationMs != null ? `${detail.durationMs}ms` : detail.durationSeconds != null ? `${detail.durationSeconds}s` : null, detail.truncated ? "truncated" : null].filter(Boolean).join(" · ");
    return <View style={styles.root}><Text selectable style={styles.meta}>{detail.query}{summary ? ` · ${summary}` : ""}</Text>{detail.filePaths?.map((path: string) => <Text key={path} selectable style={styles.result}>{path}</Text>)}{detail.webResults?.map((result: { title: string; url: string }) => <View key={result.url} style={styles.row}><Text style={styles.label}>{result.title}</Text><Text selectable style={styles.meta}>{result.url}</Text></View>)}{detail.content ? <CodePanel value={text(detail.content)} theme={theme} /> : null}</View>;
  }
  if (detail.type === "fetch") return <View style={styles.root}><Text selectable style={styles.meta}>{detail.url}{detail.code != null ? ` · ${detail.code}${detail.codeText ? ` ${detail.codeText}` : ""}` : ""}{detail.bytes != null ? ` · ${detail.bytes} bytes` : ""}</Text>{detail.prompt ? <Text selectable style={styles.label}>{detail.prompt}</Text> : null}{detail.result ? <Text selectable style={styles.result}>{detail.result}</Text> : null}</View>;
  if (detail.type === "plain_text") return <View style={styles.root}>{detail.label ? <Text style={styles.label}>{detail.label}</Text> : null}<Text selectable style={styles.result}>{text(detail.text)}</Text></View>;
  if (detail.type === "sub_agent") return <View style={styles.root}>{detail.description ? <Text selectable style={styles.label}>{detail.description}</Text> : null}{detail.actions?.map((action: { index: number; toolName: string; summary?: string }) => <Text key={action.index} selectable style={styles.meta}>{action.index + 1}. {action.toolName}{action.summary ? ` · ${action.summary}` : ""}</Text>)}{detail.log ? <CodePanel value={text(detail.log)} theme={theme} /> : null}</View>;
  if (detail.type === "worktree_setup") return <View style={styles.root}><Text selectable style={styles.meta}>{detail.branchName} · {detail.worktreePath}</Text>{detail.commands?.map((command: { index: number; command: string; status: string; exitCode?: number | null }) => <Text key={command.index} selectable style={{ color: command.status === "failed" ? theme.colors.statusDanger : theme.colors.foreground, fontFamily: "monospace", fontSize: 12 }}>{command.status === "completed" ? "✓" : command.status === "failed" ? "✕" : "○"} {command.command}{command.exitCode != null ? ` (${command.exitCode})` : ""}</Text>)}{detail.log ? <CodePanel value={text(detail.log)} theme={theme} /> : null}</View>;
  return <View style={styles.root}><CodePanel value={text(detail)} theme={theme} /></View>;
}
