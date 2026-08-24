import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, TouchableOpacity, View, type ViewStyle, type TextStyle } from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin";
import { useOpenAgent } from "../hooks/useOpenAgent";
import { type AgentEntry } from "../overview.types";
import { BadgeWithTooltip } from "./Tooltip";
import { statusColor, statusRowBackground } from "./Tooltip";

/** Format an ISO timestamp as a compact relative time like "3m ago" / "2h ago" / "5d ago". */
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h ago`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(month / 12);
  return `${year}y ago`;
}

export function AgentRow({ agent, theme, compact, hostId }: { agent: AgentEntry; theme: PluginSurfaceProps["theme"]; compact: boolean; hostId: string }) {
  const activityAt = agent.lastUserMessageAt ?? agent.updatedAt;
  const activityLabel = formatRelativeTime(activityAt);
  const activityTooltip = activityAt ? new Date(activityAt).toLocaleString() : "";

  const rowBg = statusRowBackground(agent.status, agent.requiresAttention);
  const [copied, setCopied] = useState(false);
  const copyFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!copied) return;
    Animated.timing(copyFade, { toValue: 1, duration: 150, easing: Easing.in(Easing.ease), useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(copyFade, { toValue: 0, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
      setTimeout(() => setCopied(false), 300);
    }, 1200);
    return () => clearTimeout(timer);
  }, [copied, copyFade]);

  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 12,
          paddingLeft: 32,
          paddingVertical: 6,
          backgroundColor: rowBg || undefined,
        } as ViewStyle,
        title: {
          color: theme.colors.foreground,
          fontSize: 12,
          flex: 1,
        } as TextStyle,
        meta: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          marginLeft: 8,
        } as TextStyle,
      }),
    [theme, compact, rowBg],
  );

  const { openAgent } = useOpenAgent(hostId);

  const handlePress = useCallback(() => {
    void openAgent(agent.id);
  }, [openAgent, agent.id]);

  const handleLongPress = useCallback(() => {
    const didCopy = typeof navigator !== "undefined" && (navigator as { clipboard?: { writeText(t: string): Promise<void> } }).clipboard;
    if (didCopy) {
      void (navigator as { clipboard: { writeText(t: string): Promise<void> } }).clipboard.writeText(agent.id);
    }
    setCopied(true);
  }, [agent.id]);

  return (
    <TouchableOpacity onPress={handlePress} onLongPress={handleLongPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {agent.title ?? agent.id.slice(0, 8)}
        </Text>
        {activityLabel ? (
        <BadgeWithTooltip
          label={activityLabel}
          tooltipLines={[{ key: "Last active", value: activityTooltip }]}
          theme={theme}
          color={statusColor(agent.status, theme, agent.requiresAttention)}
          pulsing={
            agent.status === "running" ||
            agent.status === "needs_input" ||
            agent.status === "initializing"
          }
        />
      ) : null}
        <Animated.View style={[{ position: "absolute", right: 8, top: 0, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: theme.colors.accent + "22" }, { opacity: copyFade }]}>
          <Text style={{ color: theme.colors.accentForeground, fontSize: 10, fontWeight: "600" as const }}>Copied!</Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}
