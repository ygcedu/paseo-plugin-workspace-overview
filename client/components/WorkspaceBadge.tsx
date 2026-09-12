import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { createBadgeStyles } from "../workspace-creator/badge-styles";

export function Badge({
  icon,
  label,
  selectable = false,
  disabled = false,
  onPress,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  selectable?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createBadgeStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityRole={selectable ? "button" : undefined}
      accessibilityLabel={selectable ? `切换 ${label}` : undefined}
      accessibilityState={{ disabled: !selectable || disabled }}
      disabled={!selectable || disabled}
      onPress={onPress}
      style={[styles.badge, selectable && styles.badgeSelectable, disabled && styles.badgeDisabled]}
    >
      <View style={styles.badgeIcon}>{icon}</View>
      <Text style={styles.badgeText} numberOfLines={1}>
        {label}
      </Text>
      {selectable ? <Icon name="ChevronDown" color={theme.colors.foregroundMuted} size={12} /> : null}
    </Pressable>
  );
}
