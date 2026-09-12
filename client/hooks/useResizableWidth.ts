import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { View } from "react-native";
import { pointerX, trackHorizontalPointer } from "../web";

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
 * Uses document-level pointer tracking on web and remains inert on native.
 */
export function useResizableWidth({
  initialWidth,
  minWidth,
  maxWidth,
  direction = "left",
}: ResizableWidthOptions): ResizableWidthResult {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const panelRef = useRef<View | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback((event: unknown) => {
    const startX = pointerX(event);
    if (startX === null) return;
    cleanupRef.current?.();
    const startWidth = width;
    setIsDragging(true);
    cleanupRef.current = trackHorizontalPointer(
      (clientX) => {
        const delta = direction === "left" ? startX - clientX : clientX - startX;
        setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth + delta)));
      },
      () => {
        cleanupRef.current = null;
        setIsDragging(false);
      },
    );
  }, [direction, maxWidth, minWidth, width]);

  return {
    width,
    isDragging,
    isHovered,
    panelRef,
    onPointerDown,
    onPointerEnter: () => setIsHovered(true),
    onPointerLeave: () => setIsHovered(false),
  };
}
