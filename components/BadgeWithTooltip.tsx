import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Text, TouchableOpacity, View, type TextStyle, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import type { TooltipLine } from "../overview.types";
import { useTooltip } from "./Tooltip";

/**
 * A badge that, on hover, asks the surface root to render a tooltip near the
 * badge. Rendering at the root avoids being clipped by the card's
 * `overflow: hidden`.
 *
 * Uses RN Web's `onMouseEnter`/`onMouseLeave` (not in the RN type defs) and
 * `measureInWindow` to compute window coordinates.
 */
export function BadgeWithTooltip({
  label,
  tooltipLines,
  theme,
  color,
  pulsing,
  onPress,
}: {
  label: string;
  tooltipLines: TooltipLine[];
  theme: PluginSurfaceProps["theme"];
  /** Optional semantic color; when provided, the badge uses it as a tinted
   *  background with matching foreground. Falls back to neutral gray. */
  color?: string;
  /** Pulse the badge opacity — used for active (running/initializing) statuses. */
  pulsing?: boolean;
  /** Called when the badge is clicked/tapped. */
  onPress?: () => void;
}) {
  const tooltipCtx = useTooltip();
  const wrapperRef = useRef<View | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulsing) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, pulse]);

  const styles = useMemo(
    () =>
      ({
        wrapper: {
          marginLeft: 8,
          flexShrink: 0,
        } as ViewStyle,
        badge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: color ? color + "22" : theme.colors.foregroundMuted + "14",
        } as ViewStyle,
        badgeText: {
          color: color ?? theme.colors.foregroundMuted,
          fontSize: 10,
          fontWeight: color ? ("600" as const) : ("400" as const),
        } as TextStyle,
      }),
    [theme, color],
  );

  const handleEnter = React.useCallback(() => {
    if (!tooltipCtx || !wrapperRef.current) return;
    wrapperRef.current.measureInWindow((x, y, width, height) => {
      tooltipCtx.show({
        x: x + width,
        y: y + height,
        lines: tooltipLines,
      });
    });
  }, [tooltipCtx, tooltipLines]);

  const handleLeave = React.useCallback(() => {
    tooltipCtx?.hide();
  }, [tooltipCtx]);

  const handlePress = React.useCallback(() => {
    onPress?.();
  }, [onPress]);

  return (
    <TouchableOpacity
      ref={wrapperRef}
      style={styles.wrapper}
      onPress={handlePress}
      {...({
        onMouseEnter: handleEnter,
        onMouseLeave: handleLeave,
      } as Record<string, unknown>)}
    >
      <Animated.View style={[styles.badge, pulsing ? { opacity: pulse } : null]}>
        <Text style={styles.badgeText}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}
