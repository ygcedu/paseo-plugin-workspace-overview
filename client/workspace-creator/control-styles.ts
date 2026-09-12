import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export function createControlStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    control: { minHeight: 28, maxWidth: 220, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: 14 } as ViewStyle,
    controlOpen: { backgroundColor: colors.foregroundMuted + "12" } as ViewStyle,
    controlDisabled: { opacity: 0.55 } as ViewStyle,
    controlValue: { color: colors.foregroundMuted, fontSize: 14, lineHeight: 18, fontWeight: "400", minWidth: 0, maxWidth: 150 } as TextStyle,
  });
}
