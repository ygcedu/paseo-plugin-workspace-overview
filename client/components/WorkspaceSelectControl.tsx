import React, { useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { ControlGlyph } from "./ControlGlyph";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import type { OpenMenu } from "../workspace-creator/types";
import { createControlStyles } from "../workspace-creator/control-styles";

export function SelectControl({
  kind,
  value,
  disabled,
  open,
  onPress,
  theme,
  iconName,
  providerId,
}: {
  kind: Exclude<OpenMenu, null>;
  value: string;
  disabled?: boolean;
  open: boolean;
  onPress: () => void;
  theme: PluginSurfaceProps["theme"];
  iconName?: string;
  providerId?: string | null;
}) {
  const styles = useMemo(() => createControlStyles(theme), [theme]);
  const iconColor = theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`切换 ${value}`}
      disabled={disabled}
      onPress={onPress}
      style={[styles.control, open && styles.controlOpen, disabled && styles.controlDisabled]}
    >
      {kind === "model" && providerId ? (
        <ProviderBrandIcon providerId={providerId} color={iconColor} size={16} />
      ) : kind === "provider" ? null : iconName ? (
        <Icon name={iconName} color={iconColor} size={16} />
      ) : (
        <ControlGlyph kind={kind} color={iconColor} />
      )}
      <Text style={styles.controlValue} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="ChevronDown" color={iconColor} size={12} />
    </Pressable>
  );
}
