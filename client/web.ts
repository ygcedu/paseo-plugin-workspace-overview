import { Platform } from "react-native";

type PointerLike = { clientX?: number; pageX?: number };
type ClipboardFileLike = {
  name?: string;
  type?: string;
};
type ClipboardItemLike = {
  kind?: string;
  type?: string;
  getAsFile?: () => ClipboardFileLike | null;
};
type ClipboardEventLike = {
  clipboardData?: { items?: ArrayLike<ClipboardItemLike> | null } | null;
  preventDefault(): void;
};
type ElementLike = {
  addEventListener(type: string, listener: (event: ClipboardEventLike) => void): void;
  removeEventListener(type: string, listener: (event: ClipboardEventLike) => void): void;
};
type DocumentLike = {
  addEventListener(type: string, listener: (event: PointerLike) => void): void;
  removeEventListener(type: string, listener: (event: PointerLike) => void): void;
  getElementById(id: string): ElementLike | null;
};

declare const document: DocumentLike;
declare class FileReader {
  result: string | ArrayBuffer | null;
  error: Error | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  readAsDataURL(file: ClipboardFileLike): void;
}

export interface PastedImage {
  data: string;
  dataUrl: string;
  mimeType: string;
  fileName: string;
}

const RASTER_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function readImage(file: ClipboardFileLike, mimeType: string, index: number): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("无法读取粘贴的图片"));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0) {
        reject(new Error("粘贴的图片格式无效"));
        return;
      }
      resolve({
        data: reader.result.slice(comma + 1),
        dataUrl: reader.result,
        mimeType,
        fileName: file.name?.trim() || `pasted-image-${index + 1}.${mimeType.split("/")[1] || "png"}`,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("无法读取粘贴的图片"));
    reader.readAsDataURL(file);
  });
}

export function subscribeToImagePaste(
  inputNativeID: string,
  onImages: (images: PastedImage[]) => void,
  onError: (message: string) => void,
): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const element = document.getElementById(inputNativeID);
  if (!element) return () => {};

  const handlePaste = (event: ClipboardEventLike) => {
    const files: Array<{ file: ClipboardFileLike; mimeType: string }> = [];
    for (const item of Array.from(event.clipboardData?.items ?? [])) {
      const mimeType = item.type?.toLowerCase() ?? "";
      if (item.kind !== "file" || !RASTER_IMAGE_TYPES.has(mimeType)) continue;
      const file = item.getAsFile?.();
      if (file) files.push({ file, mimeType });
    }
    if (files.length === 0) return;
    event.preventDefault();
    void Promise.all(files.map(({ file, mimeType }, index) => readImage(file, mimeType, index)))
      .then(onImages)
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  };

  element.addEventListener("paste", handlePaste);
  return () => element.removeEventListener("paste", handlePaste);
}

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
