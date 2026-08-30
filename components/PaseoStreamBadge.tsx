import React, { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";

function detailText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function PaseoStreamBadge({
  label,
  secondaryLabel,
  icon,
  detail,
  children,
  loading = false,
  error = false,
  theme,
}: {
  label: string;
  secondaryLabel?: string;
  icon: string;
  detail?: unknown;
  children?: ReactNode;
  loading?: boolean;
  error?: boolean;
  theme: PluginSurfaceProps["theme"];
}) {
  const [expanded, setExpanded] = useState(false);
  const content = detailText(detail);
  const interactive = content.length > 0 || Boolean(children);
  const styles = useMemo(() => ({
    root: { marginBottom: 4 } as ViewStyle,
    header: {
      minHeight: 32,
      paddingHorizontal: 8,
      paddingVertical: 4,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 8,
      borderWidth: expanded ? 1 : 0,
      borderColor: theme.colors.foregroundMuted + "2a",
      borderBottomLeftRadius: expanded ? 0 : 8,
      borderBottomRightRadius: expanded ? 0 : 8,
      backgroundColor: expanded ? theme.colors.foregroundMuted + "0d" : "transparent",
    } as ViewStyle,
    icon: { width: 22, height: 22, alignItems: "center", justifyContent: "center", marginRight: 4 } as ViewStyle,
    label: { color: expanded || loading ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 14 } as TextStyle,
    secondary: { color: theme.colors.foregroundMuted, fontSize: 14, marginLeft: 8, flex: 1 } as TextStyle,
    detail: {
      borderWidth: 1,
      borderTopWidth: 0,
      borderColor: theme.colors.foregroundMuted + "2a",
      borderBottomLeftRadius: 8,
      borderBottomRightRadius: 8,
      padding: 10,
      maxHeight: 260,
      backgroundColor: theme.colors.surface0,
    } as ViewStyle,
    detailText: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: "monospace" } as TextStyle,
  }), [expanded, loading, theme]);

  return (
    <View style={styles.root}>
      <Pressable disabled={!interactive} onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={styles.icon}>
          <Icon
            name={interactive && expanded ? "ChevronDown" : error ? "TriangleAlert" : icon}
            color={error ? theme.colors.statusDanger : expanded ? theme.colors.foreground : theme.colors.foregroundMuted}
            size={12}
          />
        </View>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        {secondaryLabel ? <Text style={styles.secondary} numberOfLines={1}>{secondaryLabel}</Text> : null}
      </Pressable>
      {expanded ? (
        <View style={styles.detail}>
          {children ?? <Text selectable style={styles.detailText}>{content}</Text>}
        </View>
      ) : null}
    </View>
  );
}
