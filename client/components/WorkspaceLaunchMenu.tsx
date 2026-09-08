import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { opaqueSurfaceColor } from "./workspace-creator-shared";
import { createMenuStyles } from "./workspace-creator-styles";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import type { LaunchTarget, TerminalProfile } from "./workspace-creator-shared";

export function WorkspaceLaunchMenu({
  target,
  profiles,
  onSelect,
  theme,
}: {
  target: LaunchTarget;
  profiles: TerminalProfile[];
  onSelect: (target: LaunchTarget) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const backgroundColor = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);

  return (
    <View style={[styles.menu, styles.menuAbove, { left: 0, width: 260, maxHeight: 360, backgroundColor }]}>
      <ScrollView style={{ maxHeight: 350 }} contentContainerStyle={{ backgroundColor }}>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ selected: target.kind === "chat" }}
        onPress={() => onSelect({ kind: "chat" })}
        style={[styles.menuItem, target.kind === "chat" && styles.menuItemSelected, { backgroundColor }]}
      >
        <View style={styles.menuIconBox}>
          <Icon name="MessageCircle" color={theme.colors.foreground} size={16} />
        </View>
        <View style={styles.menuTextGroup}>
          <Text style={styles.menuLabel}>Chat</Text>
        </View>
        {target.kind === "chat" ? <Icon name="Check" color={theme.colors.accent} size={13} /> : null}
      </Pressable>
      <View style={styles.modelBrowserHeading}><Text style={styles.modelBrowserSectionLabel}>Terminal</Text></View>
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ selected: target.kind === "terminal" && target.profileId === "blank" }}
        onPress={() => onSelect({ kind: "terminal", profileId: "blank" })}
        style={[styles.menuItem, target.kind === "terminal" && target.profileId === "blank" && styles.menuItemSelected, { backgroundColor }]}
      >
        <View style={styles.menuIconBox}><Icon name="SquareTerminal" color={theme.colors.foreground} size={16} /></View>
        <View style={styles.menuTextGroup}><Text style={styles.menuLabel}>Terminal</Text></View>
        {target.kind === "terminal" && target.profileId === "blank" ? <Icon name="Check" color={theme.colors.accent} size={13} /> : null}
      </Pressable>
      {profiles.map((profile) => {
        const selected = target.kind === "terminal" && target.profileId === profile.id;
        return (
          <Pressable
            key={profile.id}
            accessibilityRole="menuitem"
            accessibilityState={{ selected }}
            onPress={() => onSelect({ kind: "terminal", profileId: profile.id })}
            style={[styles.menuItem, selected && styles.menuItemSelected, { backgroundColor }]}
          >
            <View style={styles.menuIconBox}>
              <ProviderBrandIcon providerId={profile.icon ?? profile.id} color={theme.colors.foreground} size={16} />
            </View>
            <View style={styles.menuTextGroup}>
              <Text style={styles.menuLabel} numberOfLines={1}>{profile.name}</Text>
              <Text style={styles.menuDetail} numberOfLines={1}>{[profile.command, ...profile.args].join(" ")}</Text>
            </View>
            {selected ? <Icon name="Check" color={theme.colors.accent} size={13} /> : null}
          </Pressable>
        );
      })}
      </ScrollView>
    </View>
  );
}
