import React, { createContext, useContext } from "react";
import { type PluginSurfaceProps } from "@getpaseo/plugin";
import { type TooltipContextValue } from "../overview.types";

/**
 * Semantic status colors, chosen to read clearly on both light and dark themes.
 * Independent of theme.colors because the theme palette is limited.
 */
const STATUS_COLORS = {
  active: "#60a5fa", // light blue: running
  pending: "#86efac", // light green: needs_input, attention
  starting: "#3b82f6", // blue-500: initializing
  danger: "#ef4444", // red-500: error, failed
  warning: "#f97316", // orange-500: attention / requiresAttention (legacy)
  idle: "#9ca3af", // gray-400: everything else
} as const;

export function statusColor(status: string, theme: PluginSurfaceProps["theme"], requiresAttention?: boolean): string {
  if (requiresAttention || status === "attention" || status === "needs_input") return STATUS_COLORS.pending;
  if (status === "running") return STATUS_COLORS.active;
  if (status === "initializing") return STATUS_COLORS.starting;
  if (status === "error" || status === "failed") return STATUS_COLORS.danger;
  return theme.colors.foregroundMuted;
}

export function statusRowBackground(status: string, requiresAttention: boolean | undefined): string {
  if (requiresAttention || status === "attention" || status === "needs_input") return STATUS_COLORS.pending + "18";
  if (status === "error" || status === "failed") return STATUS_COLORS.danger + "22";
  if (status === "running") return STATUS_COLORS.active + "12";
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


export { BadgeWithTooltip } from "./BadgeWithTooltip";
