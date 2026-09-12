import React, { useCallback, useRef } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";

import { useTooltip } from "../components/Tooltip";

export function QuickActionButton({ icon, color, disabled, tooltip, accessibilityLabel, onPress, style }: {
  icon: string; color: string; disabled?: boolean; tooltip: Array<{ key: string; value: string }>;
  accessibilityLabel: string; onPress: () => void; style: ViewStyle;
}) {
  const tooltipContext = useTooltip();
  const buttonRef = useRef<View | null>(null);
  const showTooltip = useCallback(() => {
    if (!tooltipContext || !buttonRef.current) return;
    buttonRef.current.measureInWindow((x, y, width, height) => {
      tooltipContext.show({ x: x + width, y: y + height, lines: tooltip });
    });
  }, [tooltip, tooltipContext]);
  const hideTooltip = useCallback(() => tooltipContext?.hide(), [tooltipContext]);

  return (
    <Pressable
      ref={buttonRef}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={[style, disabled && { opacity: 0.55 }]}
      {...({ onMouseEnter: showTooltip, onMouseLeave: hideTooltip } as Record<string, unknown>)}
    >
      <Icon name={icon} size={14} color={color} />
    </Pressable>
  );
}

export function AutoCommitErrorToast({ message, copied, colors, containerStyle, copyButtonStyle, onDismiss, onCopy }: {
  message: string; copied: boolean;
  colors: { statusDanger: string; foregroundMuted: string; foreground: string };
  containerStyle: ViewStyle; copyButtonStyle: ViewStyle; onDismiss: () => void; onCopy: () => void;
}) {
  return (
    <View style={containerStyle}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Icon name="TriangleAlert" size={14} color={colors.statusDanger} />
        <Text style={{ color: colors.statusDanger, fontSize: 12, fontWeight: "600", marginLeft: 7, flex: 1 }}>一键提交失败</Text>
        <Pressable onPress={onDismiss} style={{ padding: 2 }}><Icon name="X" size={13} color={colors.foregroundMuted} /></Pressable>
      </View>
      <Text selectable numberOfLines={4} style={{ color: colors.foreground, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{message}</Text>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
        <Pressable onPress={onCopy} style={copyButtonStyle}>
          <Icon name={copied ? "Check" : "Copy"} size={12} color={colors.foregroundMuted} />
          <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{copied ? "已复制" : "复制错误"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
