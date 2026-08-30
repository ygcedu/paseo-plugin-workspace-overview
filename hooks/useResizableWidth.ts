import { useCallback, useEffect, useRef, useState } from "react";
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
 * Uses DOM pointer events with `setPointerCapture` and window-level
 * `pointermove` listeners. During drag, width is written directly to the
 * DOM element's style to avoid React re-renders and keep 60fps. React state
 * is only committed on pointer up.
 *
 * Technique adapted from Paseo's ResizeHandle implementation.
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
  const widthRef = useRef(initialWidth);
  const panelRef = useRef<View | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const onPointerDown = useCallback((e: unknown) => {
    const ev = e as { clientX: number; pointerId: number; target: Element; preventDefault: () => void; stopPropagation: () => void };
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = { startX: ev.clientX, startWidth: widthRef.current };
    setIsDragging(true);

    if (typeof window !== "undefined") {
      document.body.style.cursor = "ew-resize";
    }

    const target = ev.target as Element & { setPointerCapture?: (id: number) => void };
    if (typeof target.setPointerCapture === "function") {
      target.setPointerCapture(ev.pointerId);
    }

    const sign = direction === "left" ? -1 : 1;

    const onMove = (moveEv: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (moveEv.clientX - drag.startX) * sign;
      const next = Math.max(minWidth, Math.min(maxWidth, drag.startWidth + delta));
      widthRef.current = next;
      const el = panelRef.current as unknown as HTMLElement | null;
      if (el) {
        el.style.width = `${next}px`;
      }
    };

    const cleanup = () => {
      dragRef.current = null;
      setIsDragging(false);
      setWidth(widthRef.current);
      if (typeof window !== "undefined") {
        document.body.style.cursor = "";
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }, [direction, minWidth, maxWidth]);

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
