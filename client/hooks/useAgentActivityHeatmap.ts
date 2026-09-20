import { useCallback, useEffect, useRef, useState } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { PaseoClient } from "../workspace-creator/types";
import type { AgentEntry } from "../../shared/overview-types";

export interface HeatmapAgent {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  status: string;
  workspaceId?: string;
}

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
  agents: HeatmapAgent[];
}

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function buildHeatmapGrid(days = 365) {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days + 1);

  // Use Monday as the first row. Convert JS Sunday=0…Saturday=6 to Monday=0…Sunday=6.
  const leadingDays = (startDate.getDay() + 6) % 7;
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - leadingDays);

  const totalWeeks = Math.ceil((leadingDays + days) / 7);

  const monthLabels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < totalWeeks; w++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + w * 7);
    const m = d.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ weekIndex: w, label: MONTH_LABELS[m] });
      lastMonth = m;
    }
  }

  return { gridStart, totalWeeks, monthLabels };
}

export function getColors(theme: PluginSurfaceProps["theme"]) {
  const fallback = {
    surface0: "#1e1e1e",
    surface1: "#252526",
    surface2: "#303033",
    border: "#3f3f46",
    foreground: "#ffffff",
    foregroundMuted: "#888888",
    accent: "#007acc",
  };
  if (!theme || !theme.colors) return fallback;
  return { ...fallback, ...theme.colors };
}

type ColorLevel = "none" | "low" | "medium" | "high" | "very-high";

export function getCellColor(level: ColorLevel, theme: PluginSurfaceProps["theme"]): string {
  const c = getColors(theme);
  switch (level) {
    case "none": return c.surface2;
    case "low": return c.accent + "33";
    case "medium": return c.accent + "66";
    case "high": return c.accent + "aa";
    case "very-high": return c.accent;
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build daily activity counts from agent list metadata (no timeline fetch needed). */
function buildDaysFromAgents(agents: AgentEntry[]): { days: HeatmapDay[]; hasData: boolean } {
  const now = Date.now();
  const cutoffMs = now - 365 * 24 * 60 * 60 * 1000;

  const cells: HeatmapDay[] = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(now - (365 - 1 - i) * 86400000);
    return { date: formatDate(d), count: 0, agents: [] };
  });
  const cellMap = new Map(cells.map((c) => [c.date, c]));

  let totalActivity = 0;
  for (const agent of agents) {
    // Use lastUserMessageAt > updatedAt > archivedAt as fallback
    const iso = agent.lastUserMessageAt ?? agent.updatedAt ?? agent.archivedAt;
    if (!iso) continue;
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts) || ts < cutoffMs) continue;
    const key = formatDate(new Date(ts));
    const cell = cellMap.get(key);
    if (cell) {
      cell.count += 1;
      cell.agents.push({
        id: agent.id,
        title: agent.title?.trim() || "未命名 Agent",
        provider: agent.provider,
        model: agent.model,
        status: agent.status,
        workspaceId: agent.workspaceId,
      });
      totalActivity++;
    }
  }

  console.log(`[Heatmap] agents=${agents.length}, totalActivity=${totalActivity}`);

  return { days: cells, hasData: totalActivity > 0 };
}

export function useAgentActivityHeatmap(
  paseo: PaseoClient,
  agents: AgentEntry[],
  theme: PluginSurfaceProps["theme"],
) {
  const [days, setDays] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const maxCountRef = useRef(0);

  const fetchData = useCallback(() => {
    const { days: cells, hasData: dataExists } = buildDaysFromAgents(agents);
    const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
    maxCountRef.current = max;
    setDays(cells);
    setHasData(dataExists);
    setLoading(false);
  }, [agents]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh every 5 minutes
  useEffect(() => {
    const timer = setInterval(() => { void fetchData(); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchData]);

  return { days, loading, error, maxCount: maxCountRef.current, hasData };
}
