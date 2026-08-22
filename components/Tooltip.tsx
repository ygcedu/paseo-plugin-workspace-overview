import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Text, View, type ViewStyle, type TextStyle } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin";
import { type TooltipState, type TooltipContextValue, type TooltipLine } from "../overview.types";

/**
 * Semantic status colors, chosen to read clearly on both light and dark themes.
 * Independent of theme.colors because the theme palette is limited.
 */
const STATUS_COLORS = {
  active: "#22c55e", // green-500: running, needs_input
  starting: "#3b82f6", // blue-500: initializing
  danger: "#ef4444", // red-500: error, failed
  warning: "#f97316", // orange-500: attention / requiresAttention
  idle: "#9ca3af", // gray-400: everything else
} as const;

export function statusColor(status: string, theme: PluginSurfaceProps["theme"], requiresAttention?: boolean): string {
  if (requiresAttention || status === "attention") return STATUS_COLORS.warning;
  if (status === "running" || status === "needs_input") return STATUS_COLORS.active;
  if (status === "initializing") return STATUS_COLORS.starting;
  if (status === "error" || status === "failed") return STATUS_COLORS.danger;
  return theme.colors.foregroundMuted;
}

export function statusRowBackground(status: string, requiresAttention: boolean | undefined): string {
  if (requiresAttention || status === "attention") return STATUS_COLORS.warning + "18";
  if (status === "error" || status === "failed") return STATUS_COLORS.danger + "22";
  if (status === "running" || status === "needs_input") return STATUS_COLORS.active + "12";
  if (status === "initializing") return STATUS_COLORS.starting + "12";
  return "";
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function useTooltip(): TooltipContextValue | null {
  return useContext(TooltipContext);
}

export function TooltipProvider({ children, value }: { children: React.ReactNode; value: TooltipContextValue }) {
  return (
    <TooltipContext.Provider value={value}>
      {children}
    </TooltipContext.Provider>
  );
}

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
}: {
  label: string;
  tooltipLines: TooltipLine[];
  theme: PluginSurfaceProps["theme"];
  /** Optional semantic color; when provided, the badge uses it as a tinted
   *  background with matching foreground. Falls back to neutral gray. */
  color?: string;
  /** Pulse the badge opacity — used for active (running/initializing) statuses. */
  pulsing?: boolean;
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

  return (
    <View
      ref={wrapperRef}
      style={styles.wrapper}
      {...({
        onMouseEnter: handleEnter,
        onMouseLeave: handleLeave,
      } as Record<string, unknown>)}
    >
      <Animated.View style={[styles.badge, pulsing ? { opacity: pulse } : null]}>
        <Text style={styles.badgeText}>{label}</Text>
      </Animated.View>
    </View>
  );
}
