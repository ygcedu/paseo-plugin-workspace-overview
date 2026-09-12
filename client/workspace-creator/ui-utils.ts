export function formatControlValue(value: string | null, fallback: string): string {
  return value && value.trim() ? value : fallback;
}
export function opaqueSurfaceColor(surface: string, foreground: string): string {
  const rgba = surface.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) return `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
  if (/^#[0-9a-f]{8}$/i.test(surface)) return surface.slice(0, 7);
  if (/^#[0-9a-f]{6}$/i.test(surface)) return surface;
  const foregroundHex = foreground.match(/^#([0-9a-f]{6})$/i)?.[1];
  const foregroundRgb = foreground.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  const red = foregroundHex ? Number.parseInt(foregroundHex.slice(0, 2), 16) : Number(foregroundRgb?.[1] ?? 0);
  const green = foregroundHex ? Number.parseInt(foregroundHex.slice(2, 4), 16) : Number(foregroundRgb?.[2] ?? 0);
  const blue = foregroundHex ? Number.parseInt(foregroundHex.slice(4, 6), 16) : Number(foregroundRgb?.[3] ?? 0);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 128 ? "#171717" : "#ffffff";
}
