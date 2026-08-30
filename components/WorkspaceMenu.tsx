import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  const [searchQuery, setSearchQuery] = useState("");
  const window = useWindowDimensions();
  const menuBackground = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter((option) =>
            [option.label, option.detail, option.id].some((value) =>
              value?.toLocaleLowerCase().includes(normalizedQuery),
            ),
          )
        : options,
    [normalizedQuery, options],
  );
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
      <View style={styles.menuSearchRow}>
        <Icon name="Search" color={theme.colors.foregroundMuted} size={15} />
        <TextInput
          nativeID={`workspace-create-menu-search-${kind}`}
          autoFocus
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="搜索"
          placeholderTextColor={theme.colors.foregroundMuted}
          selectionColor={theme.colors.accent}
          style={styles.menuSearchInput}
        />
        {searchQuery ? (
          <Pressable accessibilityLabel="清除搜索" onPress={() => setSearchQuery("")}>
            <Icon name="X" color={theme.colors.foregroundMuted} size={14} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.modelBrowserSeparator} />
      <ScrollView
        style={[styles.menuScroll, { maxHeight: menuHeight - 12 }]}
        contentContainerStyle={{ backgroundColor: menuBackground }}
      >
        {filteredOptions.map((option) => {
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
        {filteredOptions.length === 0 ? <Text style={styles.menuEmptyText}>没有匹配结果</Text> : null}
      </ScrollView>
    </View>
  );
}
