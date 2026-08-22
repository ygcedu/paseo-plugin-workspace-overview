import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, type LayoutChangeEvent, type ViewStyle, type TextStyle } from "react-native";

import { TooltipProvider, useTooltip } from "./components/Tooltip";
import { ProjectCard } from "./components/ProjectCard";
import { useWorkspaces } from "./hooks/useWorkspaces";
import { type TooltipState } from "./overview.types";

export function WorkspaceOverview({ theme, host, layout }: PluginSurfaceProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({});
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const surfaceRef = useRef<View | null>(null);
  const surfaceOrigin = useRef({ x: 0, y: 0 });

  const paseo = usePaseo();

  const { projects, agentsByWorkspace, isLoading, error, refetch } = useWorkspaces(host.id);

  const handleOpenDirectory = useCallback((directory: string) => {
    void paseo.workspaces.open(directory);
  }, [paseo]);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleToggleBranch = useCallback((workspaceId: string, currentEffective: boolean) => {
    setExpanded((prev) => ({ ...prev, [workspaceId]: !currentEffective }));
  }, []);

  const handleToggleCard = useCallback((projectId: string, currentEffective: boolean) => {
    setCardExpanded((prev) => ({ ...prev, [projectId]: !currentEffective }));
  }, []);

  const { columns, cardWidth } = useMemo(() => {
    if (containerWidth <= 0) return { columns: 1, cardWidth: 0 };
    const CARD_GAP = 16;
    const CARD_TARGET_WIDTH = 360;
    const CARD_MIN_WIDTH = 280;
    let cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_TARGET_WIDTH + CARD_GAP)));
    let w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    while (cols > 1 && w < CARD_MIN_WIDTH) {
      cols -= 1;
      w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    }
    return { columns: cols, cardWidth: w };
  }, [containerWidth]);

  const measureSurface = useCallback(() => {
    surfaceRef.current?.measureInWindow((x, y, width, height) => {
      surfaceOrigin.current = { x, y };
      setSurfaceSize({ width, height });
    });
  }, []);

  const tooltipCtxValue = useMemo(
    () => ({
      show: (state: TooltipState) => setTooltip(state),
      hide: () => setTooltip(null),
    }),
    [],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{(error as Error).message}</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.accent }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalWorkspaces = projects.reduce((sum, p) => sum + p.workspaces.length, 0);
  const totalAgents = projects.reduce((sum, p) => sum + p.workspaces.reduce((s, ws) => s + (agentsByWorkspace.get(ws.id)?.length ?? 0), 0), 0);
  const horizontalPadding = layout.compact ? 12 : 20;

  // Tooltip dimensions (approximate; we clamp position so it stays inside the surface).
  const TOOLTIP_WIDTH = 280;
  const TOOLTIP_EST_HEIGHT = tooltip ? 24 + tooltip.lines.length * 18 : 0;

  const tooltipPos = useMemo(() => {
    if (!tooltip) return null;
    // measureInWindow returns window coords; convert to surface-local coords.
    const localX = tooltip.x - surfaceOrigin.current.x;
    const localY = tooltip.y - surfaceOrigin.current.y;
    let left = localX - TOOLTIP_WIDTH; // right-align with badge
    let top = localY + 6;
    // Clamp horizontally inside the surface.
    if (surfaceSize.width > 0) {
      if (left + TOOLTIP_WIDTH > surfaceSize.width - 8) {
        left = surfaceSize.width - TOOLTIP_WIDTH - 8;
      }
      if (left < 8) left = 8;
    }
    // Flip above the badge if there's not enough room below.
    if (surfaceSize.height > 0 && top + TOOLTIP_EST_HEIGHT > surfaceSize.height - 8) {
      top = Math.max(8, localY - TOOLTIP_EST_HEIGHT - 6);
    }
    return { left, top };
  }, [tooltip, surfaceSize, TOOLTIP_EST_HEIGHT]);

  const tooltipStyles = useMemo(
    () =>
      ({
        container: {
          position: "absolute" as const,
          width: TOOLTIP_WIDTH,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: theme.colors.foreground,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
          zIndex: 9999,
        } as ViewStyle,
        row: {
          flexDirection: "row" as const,
          marginBottom: 4,
        } as ViewStyle,
        key: {
          color: theme.colors.surface0,
          opacity: 0.6,
          fontSize: 11,
          width: 72,
          flexShrink: 0,
        } as TextStyle,
        value: {
          color: theme.colors.surface0,
          fontSize: 11,
          flex: 1,
          minWidth: 0,
          fontWeight: "500" as const,
        } as TextStyle,
      }),
    [theme],
  );

  return (
    <TooltipProvider value={tooltipCtxValue}>
      <View
        ref={surfaceRef}
        style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
        onLayout={measureSurface}
      >
        <View style={{ paddingHorizontal: horizontalPadding, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "700" as const }}>
            所有项目
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>
            {host.label} · {projects.length} 个项目 · {totalWorkspaces} 个分支 · {totalAgents} 个 agent
          </Text>
        </View>

        {projects.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 24 }}>
            <Text style={{ color: theme.colors.foregroundMuted, textAlign: "center" as const }}>
              No projects found.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: horizontalPadding,
              paddingBottom: 24,
              paddingTop: 4,
            }}
          >
            <View
              onLayout={handleContainerLayout}
              style={{
                flexDirection: "row" as const,
                flexWrap: "wrap" as const,
                justifyContent: "space-between" as const,
                alignItems: "flex-start" as const,
              }}
            >
              {cardWidth > 0 &&
                projects.map((project) => (
                  <ProjectCard
                    key={project.projectId}
                    projectId={project.projectId}
                    projectDisplayName={project.projectDisplayName}
                    workspaces={project.workspaces}
                    agentsByWorkspace={agentsByWorkspace}
                    expanded={expanded}
                    cardExpanded={cardExpanded}
                    onToggleCard={handleToggleCard}
                    onToggleBranch={handleToggleBranch}
                    onOpenDirectory={handleOpenDirectory}
                    theme={theme}
                    compact={layout.compact}
                    width={cardWidth}
                    hostLabel={host.label}
                  />
                ))}
              {columns > 1 &&
                Array.from({ length: columns - 1 }).map((_, i) => (
                  <View key={`spacer-${i}`} style={{ width: cardWidth }} />
                ))}
            </View>
          </ScrollView>
        )}

        {tooltip && tooltipPos && (
          <View
            style={[tooltipStyles.container, { left: tooltipPos.left, top: tooltipPos.top }]}
            pointerEvents="none"
          >
            {tooltip.lines.map((line, i) => (
              <View
                key={i}
                style={[tooltipStyles.row, i === tooltip.lines.length - 1 && { marginBottom: 0 }]}
              >
                <Text style={tooltipStyles.key}>{line.key}</Text>
                <Text style={tooltipStyles.value}>
                  {line.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TooltipProvider>
  );
}
