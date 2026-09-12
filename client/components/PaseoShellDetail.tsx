import React, { useMemo } from "react";
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

function shellOutputText(value: unknown): string {
  if (value == null) return "";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const trimmed = serialized.replace(/^\n+/, "");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return trimmed;
    const record = parsed as Record<string, unknown>;
    if (record.type !== "tool_result") return trimmed;
    if (typeof record.content === "string") return record.content.replace(/^\n+/, "");
    if (Array.isArray(record.content)) {
      const text = record.content
        .map((part) => typeof part === "string"
          ? part
          : typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string"
            ? String((part as Record<string, unknown>).text)
            : "")
        .filter(Boolean)
        .join("\n");
      return text || trimmed;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export function PaseoShellDetail({
  command,
  output,
  error,
  theme,
}: {
  command: string;
  output?: unknown;
  error?: unknown;
  theme: PluginSurfaceProps["theme"];
}) {
  const normalizedCommand = command.replace(/\n+$/, "");
  const normalizedOutput = shellOutputText(output);
  const errorText = shellOutputText(error);
  const styles = useMemo(() => ({
    root: {
      minWidth: 0,
      backgroundColor: theme.colors.surface1,
    } as ViewStyle,
    commandBlock: {
      minWidth: 0,
      backgroundColor: theme.colors.surface1,
    } as ViewStyle,
    commandScroll: {
      maxHeight: 400,
    } as ViewStyle,
    horizontalContent: {
      minWidth: "100%",
    } as ViewStyle,
    codeLine: {
      minWidth: "100%",
      paddingHorizontal: 12,
      paddingVertical: 12,
    } as ViewStyle,
    code: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "monospace",
    } as TextStyle,
    prompt: {
      color: theme.colors.foregroundMuted,
    } as TextStyle,
    errorSection: {
      gap: 8,
      paddingTop: 8,
    } as ViewStyle,
    errorTitle: {
      color: theme.colors.statusDanger,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
      letterSpacing: 0.5,
    } as TextStyle,
    errorBox: {
      borderWidth: 1,
      borderColor: theme.colors.statusDanger,
      borderRadius: 6,
      backgroundColor: theme.colors.surface2,
      paddingHorizontal: 12,
      paddingVertical: 10,
    } as ViewStyle,
    errorCode: {
      color: theme.colors.statusDanger,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: "monospace",
    } as TextStyle,
  }), [theme]);

  return (
    <View style={styles.root}>
      <View style={styles.commandBlock}>
        <ScrollView style={styles.commandScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={styles.horizontalContent}>
            <View style={styles.codeLine}>
              <Text selectable style={styles.code}>
                <Text style={styles.prompt}>$ </Text>
                {normalizedCommand}
                {normalizedOutput ? `\n\n${normalizedOutput}` : ""}
              </Text>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
      {errorText ? (
        <View style={styles.errorSection}>
          <Text style={styles.errorTitle}>错误</Text>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.errorBox}>
            <Text selectable style={styles.errorCode}>{errorText}</Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
