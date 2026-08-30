import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { MAX_MENU_HEIGHT, opaqueSurfaceColor } from "./workspace-creator-shared";

export function createComposerStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  const surface1 = "surface1" in colors ? colors.surface1 : colors.surface0;
  return StyleSheet.create({
    panel: {
      flexShrink: 0,
      overflow: "visible",
      backgroundColor: colors.surface0,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: colors.foregroundMuted + "18",
    } as ViewStyle,
    content: {
      width: "100%",
      maxWidth: 820,
      alignSelf: "center",
    } as ViewStyle,
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
      paddingLeft: 8,
    } as ViewStyle,
    headerText: {
      flex: 1,
      minWidth: 0,
      paddingRight: 16,
    } as ViewStyle,
    title: {
      color: colors.foreground,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: "400",
    } as TextStyle,
    formStackDesktop: {
      position: "relative",
      zIndex: 1,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 32,
      paddingLeft: 16,
      paddingRight: 16,
      gap: 8,
    } as ViewStyle,
    controlAnchor: {
      position: "relative",
      flexShrink: 0,
      overflow: "visible",
    } as ViewStyle,
    controlAnchorOpen: {
      zIndex: 20,
    } as ViewStyle,
    hostBadge: {
      flexDirection: "row",
      alignItems: "center",
      height: 28,
      maxWidth: 240,
      overflow: "hidden",
      paddingHorizontal: 8,
      borderRadius: 16,
      gap: 8,
    } as ViewStyle,
    hostStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#3e704a",
      flexShrink: 0,
    } as ViewStyle,
    hostText: {
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      color: colors.foregroundMuted,
      flexShrink: 1,
    } as TextStyle,
    launchSpacer: {
      flex: 1,
    } as ViewStyle,
    closeButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    inputWrapper: {
      position: "relative",
      zIndex: 2,
      flexDirection: "column",
      gap: 12,
      backgroundColor: surface1,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "33",
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
    } as ViewStyle,
    menuRegionActive: {
      zIndex: 10,
    } as ViewStyle,
    textInput: {
      width: "100%",
      minHeight: 46,
      maxHeight: 160,
      color: colors.foreground,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "400",
      borderWidth: 0,
      backgroundColor: "transparent",
    } as TextStyle,
    buttonRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginHorizontal: -6,
    } as ViewStyle,
    leftControls: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 0,
    } as ViewStyle,
    rightControls: {
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    } as ViewStyle,
    pendingText: {
      color: colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    sendButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    disabled: {
      opacity: 0.5,
    } as ViewStyle,
    errorText: {
      color: colors.statusDanger,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 10,
    } as TextStyle,
  });
}

export function createBadgeStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      height: 28,
      maxWidth: 240,
      overflow: "hidden",
      paddingHorizontal: 8,
      borderRadius: 16,
      gap: 4,
    } as ViewStyle,
    badgeSelectable: {
    } as ViewStyle,
    badgeDisabled: {
      opacity: 0.5,
    } as ViewStyle,
    badgeIcon: {
      width: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    } as ViewStyle,
    badgeText: {
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      color: colors.foregroundMuted,
      flexShrink: 1,
    } as TextStyle,
  });
}

export function createControlStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  return StyleSheet.create({
    control: {
      minHeight: 28,
      maxWidth: 220,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: 14,
    } as ViewStyle,
    controlOpen: {
      backgroundColor: colors.foregroundMuted + "12",
    } as ViewStyle,
    controlDisabled: {
      opacity: 0.55,
    } as ViewStyle,
    controlValue: {
      color: colors.foregroundMuted,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "400",
      minWidth: 0,
      maxWidth: 150,
    } as TextStyle,
  });
}

export function createMenuStyles(theme: PluginSurfaceProps["theme"]) {
  const colors = theme.colors;
  const menuBackground = opaqueSurfaceColor(colors.surface0, colors.foreground);
  return StyleSheet.create({
    menu: {
      position: "absolute",
      maxHeight: MAX_MENU_HEIGHT,
      zIndex: 30,
      backgroundColor: menuBackground,
      borderWidth: 1,
      borderColor: colors.foregroundMuted + "22",
      borderRadius: 8,
      paddingVertical: 4,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    } as ViewStyle,
    menuAbove: {
      bottom: 52,
    } as ViewStyle,
    menuBelow: {
      top: 36,
    } as ViewStyle,
    menuScroll: {
      maxHeight: MAX_MENU_HEIGHT - 12,
      backgroundColor: menuBackground,
    } as ViewStyle,
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: menuBackground,
    } as ViewStyle,
    menuItemSelected: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 9,
    } as ViewStyle,
    menuTextGroup: {
      flex: 1,
      minWidth: 0,
    } as ViewStyle,
    menuLabel: {
      color: colors.foreground,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500",
    } as TextStyle,
    menuDetail: {
      color: colors.foregroundMuted,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
    } as TextStyle,
    modelBrowserMenu: {
      width: 360,
      maxHeight: 400,
      overflow: "hidden",
    } as ViewStyle,
    modelBrowserHeader: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
    } as ViewStyle,
    modelBrowserTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    } as TextStyle,
    modelBrowserHeading: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
    } as ViewStyle,
    modelBrowserSectionLabel: {
      color: colors.foregroundMuted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "500",
    } as TextStyle,
    modelBrowserSeparator: {
      height: 1,
      backgroundColor: colors.foregroundMuted + "18",
    } as ViewStyle,
    modelBrowserProviderRow: {
      minHeight: 44,
    } as ViewStyle,
    modelBrowserProviderLabel: {
      flex: 1,
      minWidth: 0,
    } as TextStyle,
    modelBrowserCount: {
      color: colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 16,
    } as TextStyle,
    modelBrowserTrailing: {
      width: 20,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
  });
}
