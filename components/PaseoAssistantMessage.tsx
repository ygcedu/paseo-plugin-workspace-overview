import React, { useMemo, type ReactNode } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";

function inlineMarkdown(text: string, styles: { text: TextStyle; strong: TextStyle; code: TextStyle }): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) return <Text key={index} style={styles.code}>{token.slice(1, -1)}</Text>;
    if (token.startsWith("**") && token.endsWith("**")) return <Text key={index} style={styles.strong}>{token.slice(2, -2)}</Text>;
    return <Text key={index} style={styles.text}>{token}</Text>;
  });
}

function markdownBlocks(text: string, styles: ReturnType<typeof createStyles>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let code: string[] | null = null;
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      if (code) { nodes.push(<Text selectable key={`code-${index}`} style={styles.fence}>{code.join("\n")}</Text>); code = null; }
      else code = [];
      return;
    }
    if (code) { code.push(line); return; }
    if (!line.trim()) { nodes.push(<View key={`gap-${index}`} style={styles.gap} />); return; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const headingStyle = heading[1].length === 1 ? styles.heading1 : heading[1].length === 2 ? styles.heading2 : styles.heading3;
      nodes.push(<Text selectable key={index} style={headingStyle}>{inlineMarkdown(heading[2], styles)}</Text>);
      return;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) { nodes.push(<View key={index} style={styles.listRow}><Text style={styles.marker}>•</Text><Text selectable style={styles.listText}>{inlineMarkdown(bullet[1], styles)}</Text></View>); return; }
    const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (ordered) { nodes.push(<View key={index} style={styles.listRow}><Text style={styles.marker}>{ordered[1]}.</Text><Text selectable style={styles.listText}>{inlineMarkdown(ordered[2], styles)}</Text></View>); return; }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { nodes.push(<View key={index} style={styles.quote}><Text selectable style={styles.text}>{inlineMarkdown(quote[1], styles)}</Text></View>); return; }
    nodes.push(<Text selectable key={index} style={styles.paragraph}>{inlineMarkdown(line, styles)}</Text>);
  });
  const trailingCode = code as string[] | null;
  if (trailingCode) nodes.push(<Text selectable key="code-tail" style={styles.fence}>{trailingCode.join("\n")}</Text>);
  return nodes;
}

function createStyles(theme: PluginSurfaceProps["theme"]) {
  return {
    root: { paddingVertical: 12 } as ViewStyle,
    text: { color: theme.colors.foreground, fontSize: 15, lineHeight: 22 } as TextStyle,
    paragraph: { color: theme.colors.foreground, fontSize: 15, lineHeight: 22 } as TextStyle,
    strong: { color: theme.colors.foreground, fontSize: 15, lineHeight: 22, fontWeight: "700" } as TextStyle,
    code: { color: theme.colors.foreground, fontSize: 13, fontFamily: "monospace", backgroundColor: theme.colors.foregroundMuted + "18" } as TextStyle,
    heading1: { color: theme.colors.foreground, fontSize: 23, lineHeight: 30, fontWeight: "700", marginTop: 10, marginBottom: 6 } as TextStyle,
    heading2: { color: theme.colors.foreground, fontSize: 20, lineHeight: 27, fontWeight: "700", marginTop: 10, marginBottom: 6 } as TextStyle,
    heading3: { color: theme.colors.foreground, fontSize: 17, lineHeight: 24, fontWeight: "600", marginTop: 8, marginBottom: 4 } as TextStyle,
    fence: { color: theme.colors.foreground, backgroundColor: theme.colors.foregroundMuted + "12", borderColor: theme.colors.foregroundMuted + "28", borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 19, fontFamily: "monospace", marginVertical: 8 } as TextStyle,
    listRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2 } as ViewStyle,
    marker: { width: 24, color: theme.colors.foregroundMuted, fontSize: 15, lineHeight: 22 } as TextStyle,
    listText: { flex: 1, color: theme.colors.foreground, fontSize: 15, lineHeight: 22 } as TextStyle,
    quote: { borderLeftWidth: 3, borderLeftColor: theme.colors.foregroundMuted + "66", paddingLeft: 12, paddingVertical: 2, marginVertical: 5 } as ViewStyle,
    gap: { height: 10 } as ViewStyle,
  };
}

export function PaseoAssistantMessage({ text, theme }: { text: string; theme: PluginSurfaceProps["theme"] }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.root}>{markdownBlocks(text, styles)}</View>;
}
