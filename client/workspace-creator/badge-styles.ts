import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export function createBadgeStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    badge: { flexDirection: "row", alignItems: "center", height: 28, maxWidth: 240, overflow: "hidden", borderRadius: 16, gap: 4 } as ViewStyle,
    badgeSelectable: {} as ViewStyle,
    badgeDisabled: { opacity: 0.5 } as ViewStyle,
    badgeIcon: { width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 } as ViewStyle,
    badgeText: { minWidth: 0, fontSize: 14, lineHeight: 20, color: colors.foregroundMuted, flexShrink: 1 } as TextStyle,
  });
}
