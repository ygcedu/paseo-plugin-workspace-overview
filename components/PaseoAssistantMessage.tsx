import React, { useMemo, type ReactNode } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";

function inlineMarkdown(text: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g)
    .filter(Boolean)
    .map((token, index) => {
      if (token.startsWith("`") && token.endsWith("`")) {
        return <Text key={index} style={styles.codeInline}>{token.slice(1, -1)}</Text>;
      }
      if (
        (token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))
      ) {
        return <Text key={index} style={styles.strong}>{token.slice(2, -2)}</Text>;
      }
      if (token.startsWith("~~") && token.endsWith("~~")) {
        return <Text key={index} style={styles.strike}>{token.slice(2, -2)}</Text>;
      }
      if (
        (token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))
      ) {
        return <Text key={index} style={styles.em}>{token.slice(1, -1)}</Text>;
      }
      return <Text key={index} style={styles.text}>{token}</Text>;
    });
}

function markdownBlocks(text: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let codeBlock: { lines: string[] } | null = null;
  let codeKey = 0;

  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = /^\s*(```|~~~)/.test(line);
    if (fence) {
      if (codeBlock) {
        nodes.push(<Text selectable key={`code-${codeKey++}`} style={styles.fence}>{codeBlock.lines.join("\n")}</Text>);
        codeBlock = null;
      } else {
        codeBlock = { lines: [] };
      }
      continue;
    }

    if (codeBlock) {
      codeBlock.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      nodes.push(<View key={`gap-${index}`} style={styles.gap} />);
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push(<View key={`hr-${index}`} style={styles.hr} />);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const headingStyle =
        level === 1 ? styles.heading1 :
        level === 2 ? styles.heading2 :
        level === 3 ? styles.heading3 :
        level === 4 ? styles.heading4 :
        level === 5 ? styles.heading5 :
        styles.heading6;
      nodes.push(<Text selectable key={index} style={headingStyle}>{inlineMarkdown(heading[2], styles)}</Text>);
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      nodes.push(
        <View key={index} style={styles.listItem}>
          <Text style={styles.bulletMarker}>•</Text>
          <Text selectable style={styles.listText}>{inlineMarkdown(bullet[1], styles)}</Text>
        </View>,
      );
      continue;
    }

    const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (ordered) {
      nodes.push(
        <View key={index} style={styles.listItem}>
          <Text style={styles.orderedMarker}>{ordered[1]}.</Text>
          <Text selectable style={styles.listText}>{inlineMarkdown(ordered[2], styles)}</Text>
        </View>,
      );
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      nodes.push(
        <View key={index} style={styles.blockquote}>
          <Text selectable style={styles.paragraph}>{inlineMarkdown(quote[1], styles)}</Text>
        </View>,
      );
      continue;
    }

    nodes.push(<Text selectable key={index} style={styles.paragraph}>{inlineMarkdown(line, styles)}</Text>);
  }

  if (codeBlock) {
    nodes.push(<Text selectable key="code-tail" style={styles.fence}>{codeBlock.lines.join("\n")}</Text>);
  }

  return nodes;
}

function createStyles(theme: PluginSurfaceProps["theme"]) {
  return {
    root: { paddingVertical: 12, width: "100%" } as ViewStyle,
    text: { color: theme.colors.foreground, fontSize: 15, lineHeight: 21, flexShrink: 1 } as TextStyle,
    paragraph: { color: theme.colors.foreground, fontSize: 15, lineHeight: 21, marginBottom: 10 } as TextStyle,
    strong: { color: theme.colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "600" } as TextStyle,
    em: { color: theme.colors.foreground, fontSize: 15, lineHeight: 21, fontStyle: "italic" } as TextStyle,
    strike: { color: theme.colors.foregroundMuted, fontSize: 15, lineHeight: 21, textDecorationLine: "line-through" } as TextStyle,
    codeInline: {
      color: theme.colors.foreground,
      fontSize: 13,
      fontFamily: "monospace",
      backgroundColor: theme.colors.foregroundMuted + "18",
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
    } as TextStyle,
    heading1: {
      color: theme.colors.foreground,
      fontSize: 23,
      lineHeight: 30,
      fontWeight: "700",
      marginTop: 18,
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.foregroundMuted + "22",
      paddingBottom: 6,
    } as TextStyle,
    heading2: {
      color: theme.colors.foreground,
      fontSize: 20,
      lineHeight: 27,
      fontWeight: "700",
      marginTop: 18,
      marginBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.foregroundMuted + "22",
      paddingBottom: 6,
    } as TextStyle,
    heading3: { color: theme.colors.foreground, fontSize: 17, lineHeight: 24, fontWeight: "600", marginTop: 12, marginBottom: 6 } as TextStyle,
    heading4: { color: theme.colors.foreground, fontSize: 16, lineHeight: 23, fontWeight: "600", marginTop: 12, marginBottom: 6 } as TextStyle,
    heading5: { color: theme.colors.foreground, fontSize: 15, lineHeight: 22, fontWeight: "600", marginTop: 10, marginBottom: 4 } as TextStyle,
    heading6: {
      color: theme.colors.foregroundMuted,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "600",
      marginTop: 10,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    } as TextStyle,
    fence: {
      color: theme.colors.foreground,
      backgroundColor: theme.colors.foregroundMuted + "12",
      borderColor: theme.colors.foregroundMuted + "28",
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: "monospace",
      marginVertical: 8,
    } as TextStyle,
    listItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4, flexShrink: 1 } as ViewStyle,
    bulletMarker: { color: theme.colors.foregroundMuted, marginRight: 4, fontSize: 15, lineHeight: 21, width: 14 } as TextStyle,
    orderedMarker: { color: theme.colors.foregroundMuted, marginRight: 4, fontSize: 15, lineHeight: 21, minWidth: 18 } as TextStyle,
    listText: { flex: 1, color: theme.colors.foreground, fontSize: 15, lineHeight: 21, minWidth: 0 } as TextStyle,
    blockquote: {
      backgroundColor: theme.colors.foregroundMuted + "0d",
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.foregroundMuted + "33",
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 0,
      marginVertical: 8,
      borderRadius: 8,
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    } as ViewStyle,
    hr: { backgroundColor: theme.colors.foregroundMuted + "33", height: 1, marginVertical: 10 } as ViewStyle,
    gap: { height: 10 } as ViewStyle,
  };
}

export function PaseoAssistantMessage({ text, theme }: { text: string; theme: PluginSurfaceProps["theme"] }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.root}>{markdownBlocks(text, styles)}</View>;
}
