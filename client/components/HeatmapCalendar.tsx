import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { HeatmapDay } from "../hooks/useAgentActivityHeatmap";
import { buildHeatmapGrid, getColors, getCellColor, WEEKDAY_LABELS } from "../hooks/useAgentActivityHeatmap";

type ColorLevel = "none" | "low" | "medium" | "high" | "very-high";

function getColorLevel(count: number, maxCount: number): ColorLevel {
  if (count === 0 || maxCount === 0) return "none";
  const ratio = count / maxCount;
  if (ratio < 0.25) return "low";
  if (ratio < 0.5) return "medium";
  if (ratio < 0.75) return "high";
  return "very-high";
}

export interface HeatmapWorkspaceMeta {
  projectId: string;
  projectDisplayName: string;
  projectOrder: number;
}

interface HeatmapCalendarProps {
  days: HeatmapDay[];
  maxCount: number;
  theme: PluginSurfaceProps["theme"];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  workspaceMeta: Map<string, HeatmapWorkspaceMeta>;
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export const HeatmapCalendar = React.memo(function HeatmapCalendar({ days, maxCount, theme, selectedDate, onSelectDate, workspaceMeta }: HeatmapCalendarProps) {
  const { gridStart, totalWeeks, monthLabels } = useMemo(() => buildHeatmapGrid(365), []);
  const colors = getColors(theme);
  const CELL = 12;
  const GAP = 3;
  const COLUMN_W = CELL + GAP;
  const ROW_H = CELL + GAP;
  const GRID_WIDTH = totalWeeks * COLUMN_W;
  const TOOLTIP_WIDTH = 230;
  const [hoveredCell, setHoveredCell] = useState<{ day: HeatmapDay; week: number; weekday: number } | null>(null);
  const [scrollX, setScrollX] = useState(0);
  const [calendarSize, setCalendarSize] = useState({ width: 0, height: 0 });
  const scrollRef = useRef<ScrollView | null>(null);
  const didAutoScroll = useRef(false);
  const hoveredDay = hoveredCell?.day ?? null;

  const hoveredProjects = useMemo(() => {
    if (!hoveredDay) return [];
    const counts = new Map<string, { id: string; name: string; count: number; order: number }>();
    for (const agent of hoveredDay.agents) {
      const meta = agent.workspaceId ? workspaceMeta.get(agent.workspaceId) : undefined;
      const key = meta?.projectId ?? "unknown";
      const current = counts.get(key);
      counts.set(key, { id: key, name: meta?.projectDisplayName ?? "其他项目", count: (current?.count ?? 0) + 1, order: meta?.projectOrder ?? Number.MAX_SAFE_INTEGER });
    }
    return [...counts.values()].sort((a, b) => a.order - b.order);
  }, [hoveredDay, workspaceMeta]);

  const rows = useMemo(() => {
    const values = new Map(days.map((day) => [day.date, day]));
    const firstDate = days[0]?.date;
    const lastDate = days[days.length - 1]?.date;
    return Array.from({ length: 7 }, (_, weekday) =>
      Array.from({ length: totalWeeks }, (_, week) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + week * 7 + weekday);
        const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
        const isPadding = !firstDate || !lastDate || dateKey < firstDate || dateKey > lastDate;
        const value = values.get(dateKey);
        return { date: dateKey, count: isPadding ? 0 : (value?.count ?? 0), agents: isPadding ? [] : (value?.agents ?? []), isPadding };
      }),
    );
  }, [days, gridStart, totalWeeks]);

  return (
    <View onLayout={(event) => setCalendarSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} style={{ marginTop: 12, marginBottom: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, position: "relative" }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>近一年每日 Agent 活动</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ color: colors.foregroundMuted, fontSize: 9 }}>少</Text>
          {(["none", "low", "medium", "high", "very-high"] as ColorLevel[]).map((level) => (
            <View key={level} style={{ width: CELL, height: CELL, borderRadius: 3, backgroundColor: getCellColor(level, theme) }} />
          ))}
          <Text style={{ color: colors.foregroundMuted, fontSize: 9 }}>多</Text>
        </View>
      </View>

      {hoveredCell ? (
        <View pointerEvents="none" style={{ position: "absolute", left: (() => { const cellLeft = 46 + hoveredCell.week * COLUMN_W - scrollX; return cellLeft + CELL + 10 + TOOLTIP_WIDTH <= calendarSize.width - 12 ? cellLeft + CELL + 10 : Math.max(12, cellLeft - TOOLTIP_WIDTH - 10); })(), top: Math.max(38, Math.min(60 + hoveredCell.weekday * ROW_H - 8, calendarSize.height - (34 + Math.max(1, hoveredProjects.length) * 19) - 12)), zIndex: 20, width: TOOLTIP_WIDTH, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface0, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 10 }}>
          <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>{formatDisplayDate(hoveredCell.day.date)}</Text>
          {hoveredProjects.length > 0 ? hoveredProjects.map((project) => (
            <View key={project.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, marginTop: 5 }}>
              <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 10, flex: 1 }}>{project.name}</Text>
              <Text style={{ color: colors.foreground, fontSize: 10 }}>{project.count} 个 Agent</Text>
            </View>
          )) : <Text style={{ color: colors.foregroundMuted, fontSize: 10, marginTop: 5 }}>当天没有项目活动</Text>}
        </View>
      ) : null}

      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 34, paddingTop: 20 }}>
          {WEEKDAY_LABELS.map((label) => (
            <View key={label} style={{ height: ROW_H, justifyContent: "center", alignItems: "flex-end", paddingRight: 6 }}>
              <Text style={{ color: colors.foregroundMuted, fontSize: 9, lineHeight: ROW_H }}>{label}</Text>
            </View>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onLayout={(event) => {
            const viewportWidth = event.nativeEvent.layout.width;
            if (GRID_WIDTH <= viewportWidth) {
              didAutoScroll.current = false;
              return;
            }
            if (!didAutoScroll.current) {
              didAutoScroll.current = true;
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
            }
          }}
          onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
          style={{ flexGrow: 0 }}
        >
          <View style={{ width: GRID_WIDTH }}>
            <View style={{ height: 20, position: "relative" }}>
              {monthLabels.map(({ weekIndex, label }) => (
                <Text key={weekIndex} style={{ position: "absolute", left: weekIndex * COLUMN_W, color: colors.foregroundMuted, fontSize: 9 }}>{label}</Text>
              ))}
            </View>
            {rows.map((row, weekday) => (
              <View key={weekday} style={{ flexDirection: "row", height: ROW_H, gap: GAP }}>
                {row.map((cell, week) => (
                  <Pressable key={cell.date} disabled={cell.isPadding} accessibilityRole="button" accessibilityLabel={`${cell.date}: ${cell.count} 个 Agent`} onHoverIn={() => setHoveredCell({ day: cell, week, weekday })} onHoverOut={() => setHoveredCell((current) => current?.day.date === cell.date ? null : current)} onFocus={() => setHoveredCell({ day: cell, week, weekday })} onBlur={() => setHoveredCell((current) => current?.day.date === cell.date ? null : current)} onPress={() => onSelectDate(cell.date)}>
                    {selectedDate === cell.date ? (
                      <View style={{ width: CELL + 2, height: CELL + 2, marginLeft: -1, marginTop: -1, borderRadius: 4, padding: 2, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 0 }, elevation: 4 }}>
                        <View style={{ flex: 1, borderRadius: 2, backgroundColor: getCellColor(getColorLevel(cell.count, maxCount), theme) }} />
                      </View>
                    ) : (
                      <View style={{ width: CELL, height: CELL, borderRadius: 3, backgroundColor: cell.isPadding ? colors.surface1 : getCellColor(getColorLevel(cell.count, maxCount), theme) }} />
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
});
