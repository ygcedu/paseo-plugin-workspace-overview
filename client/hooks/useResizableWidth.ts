import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { View } from "react-native";

export interface ResizableWidthOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Direction the panel grows. "left" = dragging left increases width (right-edge panel). */
  direction?: "left" | "right";
}

export interface ResizableWidthResult {
  width: number;
  isDragging: boolean;
  isHovered: boolean;
  panelRef: RefObject<View | null>;
  onPointerDown: (e: unknown) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Pointer-based resizable width hook.
 *
 * Mobile-safe fallback. Native plugin surfaces do not expose DOM pointer
 * capture, so the panel keeps its initial width and the handle stays inert.
 */
export function useResizableWidth({
  initialWidth,
  minWidth,
  maxWidth,
  direction = "left",
}: ResizableWidthOptions): ResizableWidthResult {
  const width = initialWidth;
  const [isHovered, setIsHovered] = useState(false);
  const panelRef = useRef<View | null>(null);
  void direction;
  void minWidth;
  void maxWidth;

  return {
    width,
    isDragging: false,
    isHovered,
    panelRef,
    onPointerDown: () => {},
    onPointerEnter: () => setIsHovered(true),
    onPointerLeave: () => setIsHovered(false),
  };
}
