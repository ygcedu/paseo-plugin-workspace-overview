import { Platform } from "react-native";

type PointerLike = { clientX?: number; pageX?: number };
type DocumentLike = {
  addEventListener(type: string, listener: (event: PointerLike) => void): void;
  removeEventListener(type: string, listener: (event: PointerLike) => void): void;
};

declare const document: DocumentLike;

export function pointerX(event: unknown): number | null {
  if (Platform.OS !== "web" || !event || typeof event !== "object") return null;
  const nativeEvent = (event as { nativeEvent?: PointerLike }).nativeEvent;
  const value = nativeEvent?.clientX ?? nativeEvent?.pageX;
  return typeof value === "number" ? value : null;
}

export function trackHorizontalPointer(
  onMove: (clientX: number) => void,
  onEnd: () => void,
): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const move = (event: PointerLike) => {
    const value = event.clientX ?? event.pageX;
    if (typeof value === "number") onMove(value);
  };
  const end = () => {
    cleanup();
    onEnd();
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  return cleanup;
}
