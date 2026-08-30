import React, { useEffect, useMemo } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { MAX_MENU_HEIGHT, MENU_WIDTH_BY_KIND, opaqueSurfaceColor, type MenuOption, type OpenMenu } from "./workspace-creator-shared";
import { createMenuStyles } from "./workspace-creator-styles";
import { ProjectIcon } from "./ProjectIcon";

export function Menu({
  kind,
  placement = "above",
  options,
  selectedId,
  onSelect,
  theme,
}: {
  kind: Exclude<OpenMenu, null>;
  placement?: "above" | "below";
  options: MenuOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const window = useWindowDimensions();
  const menuBackground = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  if (options.length === 0) return null;
  const menuWidth = Math.min(MENU_WIDTH_BY_KIND[kind], Math.max(180, window.width - 80));
  const menuHeight = Math.min(
    placement === "below" ? 160 : MAX_MENU_HEIGHT,
    Math.max(120, window.height * 0.45),
  );
  return (
    <View
      style={[
        styles.menu,
        placement === "below" ? styles.menuBelow : styles.menuAbove,
        { left: 0 },
        { width: menuWidth, maxHeight: menuHeight },
      ]}
    >
      <ScrollView
        style={[styles.menuScroll, { maxHeight: menuHeight - 12 }]}
        contentContainerStyle={{ backgroundColor: menuBackground }}
      >
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              onPress={() => onSelect(option.id)}
              style={[styles.menuItem, selected && styles.menuItemSelected]}
            >
              {option.projectIconDataUri !== undefined ? (
                <View style={styles.menuIconBox}>
                  <ProjectIcon dataUri={option.projectIconDataUri} label={option.label} theme={theme} />
                </View>
              ) : option.iconName ? (
                <View style={styles.menuIconBox}>
                  <Icon name={option.iconName} color={theme.colors.foreground} size={16} />
                </View>
              ) : null}
              <View style={styles.menuTextGroup}>
                <Text style={styles.menuLabel} numberOfLines={1}>
                  {option.label}
                </Text>
                {option.detail ? (
                  <Text style={styles.menuDetail} numberOfLines={1}>
                    {option.detail}
                  </Text>
                ) : null}
              </View>
              {selected ? <Icon name="Check" color={theme.colors.accent} size={13} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
