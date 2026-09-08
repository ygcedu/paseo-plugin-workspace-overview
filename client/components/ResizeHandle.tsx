import React, { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useResizableWidth } from "../hooks/useResizableWidth";

export interface ResizeHandleProps {
  theme: PluginSurfaceProps["theme"];
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Position the handle on the left or right edge of the panel. */
  side?: "left" | "right";
  /** Visual style: "grip" shows a vertical bar, "line" shows a thin line. */
  variant?: "grip" | "line";
  /** Additional style applied to the panel container. */
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * A panel wrapper with a built-in drag-to-resize handle.
 *
 * Uses `useResizableWidth` internally. During drag, width is written directly
 * to the DOM to avoid React re-renders. The committed width is exposed via
 * the render context if needed.
 *
 * Usage:
 * ```tsx
 * <ResizeHandle theme={theme} side="left" initialWidth={420} minWidth={320} maxWidth={720}>
 *   <PanelContent />
 * </ResizeHandle>
 * ```
 */
export function ResizeHandle({
  theme,
  initialWidth = 420,
  minWidth = 320,
  maxWidth = 720,
  side = "left",
  variant = "grip",
  style,
  children,
}: ResizeHandleProps) {
  const { width, isDragging, isHovered, panelRef, onPointerDown, onPointerEnter, onPointerLeave } =
    useResizableWidth({ initialWidth, minWidth, maxWidth, direction: side });

  const active = isDragging || isHovered;
  const color = isDragging
    ? theme.colors.accent
    : isHovered
      ? theme.colors.foregroundMuted
      : theme.colors.foregroundMuted + "55";
  const bg = active ? theme.colors.foregroundMuted + "15" : "transparent";

  const styles = useMemo(() => {
    const handle: ViewStyle = {
      position: "absolute",
      [side]: -8,
      top: 0,
      bottom: 0,
      width: 16,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    };
    const bar: ViewStyle =
      variant === "grip"
        ? { width: 3, height: 22, borderRadius: 1.5, backgroundColor: color }
        : { width: 2, flex: 1, borderRadius: 1, backgroundColor: color };
    return {
      panel: { width, ...style } as ViewStyle,
      handle: { ...handle, cursor: "ew-resize" } as unknown as ViewStyle,
      bar,
      bg: { backgroundColor: bg } as ViewStyle,
    };
  }, [width, side, variant, color, bg, style]);

  return (
    <View ref={panelRef} style={styles.panel}>
      <View
        style={[styles.handle, styles.bg]}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter as () => void}
        onPointerLeave={onPointerLeave as () => void}
      >
        <View style={styles.bar} />
      </View>
      {children}
    </View>
  );
}
