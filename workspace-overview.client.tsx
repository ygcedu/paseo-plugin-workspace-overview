import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
  type TextStyle,
} from "react-native";

const CARD_GAP = 16;
const CARD_TARGET_WIDTH = 360;
const CARD_MIN_WIDTH = 280;

type WorkspaceStatus =
  | "needs_input"
  | "failed"
  | "running"
  | "attention"
  | "done"
  | string;

interface WorkspaceEntry {
  id: string;
  projectId: string;
  projectDisplayName: string;
  name: string;
  status: WorkspaceStatus;
  statusEnteredAt?: string | null;
  activityAt?: string | null;
  workspaceKind: "directory" | "local_checkout" | "checkout" | "worktree";
  directory: string;
  gitRuntime?: { currentBranch?: string | null } | null;
}

interface AgentEntry {
  id: string;
  workspaceId?: string;
  title: string | null;
  provider: string;
  model: string | null;
  status: "initializing" | "idle" | "running" | "error" | "closed" | string;
  updatedAt?: string;
  lastUserMessageAt?: string | null;
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
}

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

/** Extract the last path segment for compact display. */
function basename(path: string): string {
  if (!path) return "";
  const trimmed = path.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Vector-style chevron icon drawn with two rotated View bars.
 * react-native-svg / lucide-react-native are not on the plugin client allow-list,
 * so this is the closest we can get to an SVG-style icon using only RN primitives.
 */
function ChevronIcon({ expanded, color, size = 10 }: { expanded: boolean; color: string; size?: number }) {
  const thickness = Math.max(1.5, size / 7);
  const half = size / 2;
  const bar = size * 0.7;

  if (expanded) {
    // Chevron-down: two bars forming a "∨"
    return (
      <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
        <View
          style={{
            position: "absolute",
            width: bar,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: color,
            transform: [{ translateX: -bar * 0.25 }, { rotate: "45deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            width: bar,
            height: thickness,
            borderRadius: thickness / 2,
            backgroundColor: color,
            transform: [{ translateX: bar * 0.25 }, { rotate: "-45deg" }],
          }}
        />
      </View>
    );
  }
  // Chevron-right: two bars forming a ">"
  return (
    <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateY: -bar * 0.25 }, { rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: bar,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: color,
          transform: [{ translateY: bar * 0.25 }, { rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

/**
 * Semantic status colors, chosen to read clearly on both light and dark themes.
 * Independent of theme.colors because the theme palette is limited.
 */
const STATUS_COLORS = {
  active: "#22c55e", // green-500: running, needs_input
  starting: "#3b82f6", // blue-500: initializing
  danger: "#ef4444", // red-500: error, attention, failed
  idle: "#9ca3af", // gray-400: everything else
} as const;

function statusColor(status: string, theme: PluginSurfaceProps["theme"]): string {
  if (status === "running" || status === "needs_input") return STATUS_COLORS.active;
  if (status === "initializing") return STATUS_COLORS.starting;
  if (status === "error" || status === "attention" || status === "failed") return STATUS_COLORS.danger;
  return theme.colors.foregroundMuted;
}

/** Row background tint for high-priority statuses; empty string for no tint. */
export function statusRowBackground(status: string, requiresAttention: boolean | undefined): string {
  if (status === "error" || status === "attention" || status === "failed") return STATUS_COLORS.danger + "22";
  if (requiresAttention) return STATUS_COLORS.danger + "18";
  if (status === "running" || status === "needs_input") return STATUS_COLORS.active + "12";
  if (status === "initializing") return STATUS_COLORS.starting + "12";
  return "";
}

function StatusDot({ status, theme }: { status: string; theme: PluginSurfaceProps["theme"] }) {
  const color = statusColor(status, theme);

  const isActive = status === "running" || status === "needs_input" || status === "initializing";
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isActive) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, pulse]);

  if (isActive) {
    return (
      <Animated.View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          marginRight: 8,
          flexShrink: 0,
          opacity: pulse,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

function AgentRow({ agent, theme, compact }: { agent: AgentEntry; theme: PluginSurfaceProps["theme"]; compact: boolean }) {
  const activityAt = agent.lastUserMessageAt ?? agent.updatedAt;
  const activityLabel = formatRelativeTime(activityAt);
  const activityTooltip = activityAt ? new Date(activityAt).toLocaleString() : "";

  const rowBg = statusRowBackground(agent.status, agent.requiresAttention);

  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 16,
          paddingLeft: 36, // indented under branch
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

  const handlePress = useCallback(() => {
    // Paseo plugin SDK has no API to navigate to an agent's session, so the
    // best we can do is copy the agent id to the clipboard for manual lookup.
    // Clipboard is not in the plugin client allow-list either, so use the DOM
    // API on web; on native this is a no-op.
    if (typeof navigator !== "undefined" && (navigator as { clipboard?: { writeText(t: string): Promise<void> } }).clipboard) {
      void (navigator as { clipboard: { writeText(t: string): Promise<void> } }).clipboard.writeText(agent.id);
    }
  }, [agent.id]);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={styles.row}>
        <StatusDot status={agent.status} theme={theme} />
        <Text style={styles.title} numberOfLines={1}>
          {agent.title ?? agent.id.slice(0, 8)}
        </Text>
        {activityLabel ? (
        <BadgeWithTooltip
          label={activityLabel}
          tooltipLines={[{ key: "Last active", value: activityTooltip }]}
          theme={theme}
        />
      ) : null}
      </View>
    </TouchableOpacity>
  );
}

const KIND_LABEL: Record<WorkspaceEntry["workspaceKind"], string> = {
  worktree: "Worktree",
  checkout: "Checkout",
  local_checkout: "Local",
  directory: "Dir",
};

interface TooltipLine {
  key: string;
  value: string;
}

interface TooltipState {
  /** Window coordinates of the badge's right edge. */
  x: number;
  /** Window Y of the badge's bottom edge. */
  y: number;
  lines: TooltipLine[];
}

interface TooltipContextValue {
  show: (state: TooltipState) => void;
  hide: () => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

/**
 * A badge that, on hover, asks the surface root to render a tooltip near the
 * badge. Rendering at the root avoids being clipped by the card's
 * `overflow: hidden`.
 *
 * Uses RN Web's `onMouseEnter`/`onMouseLeave` (not in the RN type defs) and
 * `measureInWindow` to compute window coordinates.
 */
function BadgeWithTooltip({
  label,
  tooltipLines,
  theme,
}: {
  label: string;
  tooltipLines: TooltipLine[];
  theme: PluginSurfaceProps["theme"];
}) {
  const tooltipCtx = useContext(TooltipContext);
  const wrapperRef = useRef<View | null>(null);

  const styles = useMemo(
    () =>
      ({
        wrapper: {
          marginLeft: 8,
          flexShrink: 0,
        } as ViewStyle,
        badge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.foregroundMuted + "14",
        } as ViewStyle,
        badgeText: {
          color: theme.colors.foregroundMuted,
          fontSize: 10,
        } as TextStyle,
      }),
    [theme],
  );

  const handleEnter = useCallback(() => {
    if (!tooltipCtx || !wrapperRef.current) return;
    wrapperRef.current.measureInWindow((x, y, width, height) => {
      tooltipCtx.show({
        x: x + width,
        y: y + height,
        lines: tooltipLines,
      });
    });
  }, [tooltipCtx, tooltipLines]);

  const handleLeave = useCallback(() => {
    tooltipCtx?.hide();
  }, [tooltipCtx]);

  return (
    <View
      ref={wrapperRef}
      style={styles.wrapper}
      {...({
        onMouseEnter: handleEnter,
        onMouseLeave: handleLeave,
      } as Record<string, unknown>)}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
    </View>
  );
}

function BranchRow({
  workspace,
  agents,
  expanded,
  onToggle,
  theme,
  compact,
  hostLabel,
}: {
  workspace: WorkspaceEntry;
  agents: AgentEntry[];
  expanded: boolean;
  onToggle: () => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  hostLabel: string;
}) {
  const branchLabel = useMemo(() => {
    const b = workspace.gitRuntime?.currentBranch;
    if (b) return b.replace(/^heads\//, "");
    return workspace.name;
  }, [workspace.gitRuntime?.currentBranch, workspace.name]);

  const styles = useMemo(
    () =>
      ({
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          paddingHorizontal: 12,
          paddingVertical: 8,
        } as ViewStyle,
        chevron: {
          width: 16,
          marginRight: 4,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        } as ViewStyle,
        name: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontWeight: "500" as const,
          flex: 1,
        } as TextStyle,
      }),
    [theme],
  );

  // Compose tooltip content as key/value rows.
  const tooltipLines = useMemo(() => {
    const lines: Array<{ key: string; value: string }> = [
      { key: "Kind", value: KIND_LABEL[workspace.workspaceKind] ?? workspace.workspaceKind },
      { key: "Branch", value: branchLabel },
      { key: "Directory", value: workspace.directory },
      { key: "Host", value: hostLabel },
      { key: "Status", value: workspace.status },
    ];
    if (workspace.statusEnteredAt) {
      lines.push({ key: "Since", value: new Date(workspace.statusEnteredAt).toLocaleString() });
    }
    if (agents.length > 0) {
      lines.push({ key: "Agents", value: String(agents.length) });
    }
    return lines;
  }, [workspace, branchLabel, hostLabel, agents.length]);

  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.row}>
        <View style={styles.chevron}>
          <ChevronIcon expanded={expanded} color={theme.colors.foregroundMuted} size={10} />
        </View>
        <StatusDot status={workspace.status} theme={theme} />
        <Text style={styles.name} numberOfLines={1}>
          {branchLabel}
        </Text>
        <BadgeWithTooltip
          label={KIND_LABEL[workspace.workspaceKind] ?? workspace.workspaceKind}
          tooltipLines={tooltipLines}
          theme={theme}
        />
      </View>
    </TouchableOpacity>
  );
}

interface ProjectCardProps {
  projectId: string;
  projectDisplayName: string;
  workspaces: WorkspaceEntry[];
  agentsByWorkspace: Map<string, AgentEntry[]>;
  /** Branch-level expand state. undefined means "user hasn't toggled; use auto rule". */
  expanded: Record<string, boolean>;
  /** Card-level expand state. Same undefined semantics as expanded. */
  cardExpanded: Record<string, boolean>;
  onToggleCard: (projectId: string, currentEffective: boolean) => void;
  onToggleBranch: (workspaceId: string, currentEffective: boolean) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  width: number;
  hostLabel: string;
}

/** Decide whether an agent should auto-expand its surroundings on first view. */
function shouldAutoExpandAgent(agent: AgentEntry): boolean {
  return (
    agent.status === "running" ||
    agent.status === "error" ||
    agent.requiresAttention === true
  );
}

function ProjectCard({
  projectId,
  projectDisplayName,
  workspaces,
  agentsByWorkspace,
  expanded,
  cardExpanded,
  onToggleCard,
  onToggleBranch,
  theme,
  compact,
  width,
  hostLabel,
}: ProjectCardProps) {
  // Card-level expand: explicit user toggle wins; otherwise auto-expand when
  // any branch contains a running/errored/attention agent.
  const cardIsExpanded = useMemo(() => {
    const explicit = cardExpanded[projectId];
    if (explicit !== undefined) return explicit;
    return workspaces.some((ws) => (agentsByWorkspace.get(ws.id) ?? []).some(shouldAutoExpandAgent));
  }, [cardExpanded, projectId, workspaces, agentsByWorkspace]);

  const toggleCard = useCallback(
    () => onToggleCard(projectId, cardIsExpanded),
    [onToggleCard, projectId, cardIsExpanded],
  );
  const styles = useMemo(
    () =>
      ({
        card: {
          width,
          backgroundColor: theme.colors.surface0,
          borderRadius: 12,
          overflow: "hidden" as const,
          marginBottom: CARD_GAP,
          borderWidth: 1,
          borderColor: theme.colors.foregroundMuted + "33",
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        } as ViewStyle,
        header: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.colors.foregroundMuted + "14",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.foregroundMuted + "26",
        } as ViewStyle,
        headerChevron: {
          width: 16,
          marginRight: 6,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        } as ViewStyle,
        title: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontWeight: "600" as const,
          flex: 1,
        } as TextStyle,
        counter: {
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          marginLeft: 8,
        } as TextStyle,
        body: {
          paddingVertical: 0,
        } as ViewStyle,
        divider: {
          height: 1,
          backgroundColor: theme.colors.foregroundMuted + "14",
          marginLeft: 12,
        } as ViewStyle,
      }),
    [theme, width],
  );

  const totalAgents = useMemo(
    () => workspaces.reduce((sum, ws) => sum + (agentsByWorkspace.get(ws.id)?.length ?? 0), 0),
    [workspaces, agentsByWorkspace],
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={toggleCard} activeOpacity={0.7}>
        <View style={styles.header}>
          <View style={styles.headerChevron}>
            <ChevronIcon expanded={cardIsExpanded} color={theme.colors.foregroundMuted} size={10} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {projectDisplayName}
          </Text>
          <Text style={styles.counter}>
            {workspaces.length} branch{workspaces.length !== 1 ? "es" : ""}
            {totalAgents > 0 ? ` · ${totalAgents} agent${totalAgents !== 1 ? "s" : ""}` : ""}
          </Text>
        </View>
      </TouchableOpacity>
      {cardIsExpanded && (
        <View style={styles.body}>
        {workspaces.map((ws, idx) => {
          const wsAgents = agentsByWorkspace.get(ws.id) ?? [];
          // If the user hasn't manually toggled this branch yet (undefined),
          // auto-expand when it contains a running/errored/attention agent.
          const explicit = expanded[ws.id];
          const isExpanded = explicit !== undefined ? explicit : wsAgents.some(shouldAutoExpandAgent);
          return (
            <View key={ws.id}>
              {idx > 0 && <View style={styles.divider} />}
              <BranchRow
                workspace={ws}
                agents={wsAgents}
                expanded={isExpanded}
                onToggle={() => onToggleBranch(ws.id, isExpanded)}
                theme={theme}
                compact={compact}
                hostLabel={hostLabel}
              />
              {isExpanded &&
                wsAgents.map((agent) => (
                  <AgentRow key={agent.id} agent={agent} theme={theme} compact={compact} />
                ))}
              {isExpanded && wsAgents.length === 0 && (
                <View style={{ paddingHorizontal: 36, paddingVertical: 6 }}>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                    No agents in this branch.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
        </View>
      )}
    </View>
  );
}

export function WorkspaceOverview({ theme, host, layout }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const [containerWidth, setContainerWidth] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cardExpanded, setCardExpanded] = useState<Record<string, boolean>>({});
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const surfaceRef = useRef<View | null>(null);
  const surfaceOrigin = useRef({ x: 0, y: 0 });

  const showTooltip = useCallback((state: TooltipState) => setTooltip(state), []);
  const hideTooltip = useCallback(() => setTooltip(null), []);
  const tooltipCtxValue = useMemo(
    () => ({ show: showTooltip, hide: hideTooltip }),
    [showTooltip, hideTooltip],
  );

  const measureSurface = useCallback(() => {
    surfaceRef.current?.measureInWindow((x, y, width, height) => {
      surfaceOrigin.current = { x, y };
      setSurfaceSize({ width, height });
    });
  }, []);

  const { data: wsResult, isLoading: wsLoading, error: wsError, refetch } = useQuery({
    queryKey: ["ws-list", host.id],
    queryFn: () => paseo.workspaces.list({ subscribe: {} }),
    refetchInterval: 5000,
  });

  const { data: agResult, isLoading: agLoading } = useQuery({
    queryKey: ["ag-list", host.id],
    queryFn: () => paseo.agents.list({ scope: "active" }),
    refetchInterval: 5000,
  });

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
    let cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_TARGET_WIDTH + CARD_GAP)));
    let w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    while (cols > 1 && w < CARD_MIN_WIDTH) {
      cols -= 1;
      w = Math.floor((containerWidth - CARD_GAP * (cols - 1)) / cols);
    }
    return { columns: cols, cardWidth: w };
  }, [containerWidth]);

  // Group workspaces by project, and agents by workspace.
  const { projects, agentsByWorkspace } = useMemo(() => {
    const workspaces = (wsResult?.entries ?? []) as WorkspaceEntry[];
    const agents = (agResult?.entries ?? []) as Array<{ agent: AgentEntry }>;

    // Activity timestamp (ms) for an agent; 0 when unknown (sorts last).
    const agentActivity = (a: AgentEntry): number => {
      const iso = a.lastUserMessageAt ?? a.updatedAt;
      const t = iso ? new Date(iso).getTime() : 0;
      return Number.isNaN(t) ? 0 : t;
    };

    const agentsByWs = new Map<string, AgentEntry[]>();
    for (const entry of agents) {
      const wsId = entry.agent.workspaceId;
      if (!wsId) continue;
      const list = agentsByWs.get(wsId) ?? [];
      list.push(entry.agent);
      agentsByWs.set(wsId, list);
    }
    // Sort agents inside each workspace by last activity, newest first.
    for (const list of agentsByWs.values()) {
      list.sort((a, b) => agentActivity(b) - agentActivity(a));
    }

    const byProject = new Map<string, { projectId: string; projectDisplayName: string; workspaces: WorkspaceEntry[] }>();
    for (const ws of workspaces) {
      const pid = ws.projectId || ws.id;
      const existing = byProject.get(pid);
      if (existing) {
        existing.workspaces.push(ws);
      } else {
        byProject.set(pid, {
          projectId: pid,
          projectDisplayName: ws.projectDisplayName || pid,
          workspaces: [ws],
        });
      }
    }

    // Compute each workspace's "last activity" timestamp (ms since epoch).
    // Prefer the latest agent activity; fall back to workspace activityAt,
    // then statusEnteredAt. Returns 0 when nothing is known (sorts last).
    const workspaceActivity = (ws: WorkspaceEntry): number => {
      const agents = agentsByWs.get(ws.id) ?? [];
      let latest = 0;
      for (const a of agents) {
        const t = agentActivity(a);
        if (t > latest) latest = t;
      }
      if (latest > 0) return latest;
      const fallbackIso = ws.activityAt ?? ws.statusEnteredAt;
      if (fallbackIso) {
        const t = new Date(fallbackIso).getTime();
        if (!Number.isNaN(t)) return t;
      }
      return 0;
    };

    // Sort workspaces inside each project by last activity, newest first.
    for (const project of byProject.values()) {
      project.workspaces.sort((a, b) => workspaceActivity(b) - workspaceActivity(a));
    }

    // Sort projects by their own last activity (max over their workspaces), newest first.
    const projects = Array.from(byProject.values()).sort((a, b) => {
      const aMax = a.workspaces.reduce((m, ws) => Math.max(m, workspaceActivity(ws)), 0);
      const bMax = b.workspaces.reduce((m, ws) => Math.max(m, workspaceActivity(ws)), 0);
      return bMax - aMax;
    });

    return { projects, agentsByWorkspace: agentsByWs };
  }, [wsResult, agResult]);

  if (wsLoading || agLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>
      </View>
    );
  }

  if (wsError) {
    return (
      <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: theme.colors.surface0, padding: 24 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{wsError.message}</Text>
        <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.accent }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalWorkspaces = projects.reduce((sum, p) => sum + p.workspaces.length, 0);
  const totalAgents = (agResult?.entries ?? []).length;
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
          fontWeight: "500" as const,
        } as TextStyle,
      }),
    [theme],
  );

  return (
    <TooltipContext.Provider value={tooltipCtxValue}>
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
                <Text style={tooltipStyles.value} numberOfLines={3}>
                  {line.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TooltipContext.Provider>
  );
}
