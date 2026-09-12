import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { selectableModels } from "../workspace-creator/provider-selection";
import { opaqueSurfaceColor } from "../workspace-creator/ui-utils";
import type { ComposerSelection, ProviderEntry } from "../workspace-creator/types";
import { createMenuStyles } from "./workspace-creator-styles";

export function ModelBrowserMenu({
  providers,
  selection,
  onSelect,
  theme,
}: {
  providers: ProviderEntry[];
  selection: ComposerSelection | null;
  onSelect: (id: string) => void;
  theme: PluginSurfaceProps["theme"];
}) {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const backgroundColor = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  const provider = providerId ? providers.find((entry) => entry.provider === providerId) ?? null : null;
  const models = selectableModels(provider);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredModels = models.filter((model) =>
    [model.label, model.id].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
  const filteredProviders = providers.filter((entry) => {
    if (!normalizedQuery) return true;
    if ([entry.label, entry.provider].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))) {
      return true;
    }
    return selectableModels(entry).some((model) =>
      [model.label, model.id].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  });

  const search = (
    <>
      <View style={[styles.menuSearchRow, { backgroundColor }]}>
        <Icon name="Search" color={theme.colors.foregroundMuted} size={15} />
        <TextInput
          nativeID="workspace-create-model-search"
          autoFocus
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={provider ? "搜索 Model" : "搜索 Provider 或 Model"}
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
    </>
  );

  return (
    <View style={[styles.menu, styles.menuAbove, styles.modelBrowserMenu, { left: 0 }]}>
      {provider ? (
        <>
          <Pressable onPress={() => setProviderId(null)} style={[styles.modelBrowserHeader, { backgroundColor }]}>
            <Icon name="ChevronLeft" color={theme.colors.foregroundMuted} size={16} />
            <ProviderBrandIcon providerId={provider.provider} color={theme.colors.foregroundMuted} size={16} />
            <Text style={styles.modelBrowserTitle} numberOfLines={1}>{provider.label ?? provider.provider}</Text>
          </Pressable>
          <View style={styles.modelBrowserSeparator} />
          {search}
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {filteredModels.map((model) => {
              const selected = selection?.providerId === provider.provider && selection.modelId === model.id;
              return (
                <Pressable
                  key={model.id}
                  onPress={() => onSelect(`${provider.provider}::${model.id}`)}
                  style={[styles.menuItem, { backgroundColor }]}
                >
                  <View style={styles.menuTextGroup}>
                    <Text style={styles.menuLabel} numberOfLines={1}>{model.label}</Text>
                    {model.id !== model.label ? <Text style={styles.menuDetail} numberOfLines={1}>{model.id}</Text> : null}
                  </View>
                  <View style={styles.modelBrowserTrailing}>
                    {selected ? <Icon name="Check" color={theme.colors.foregroundMuted} size={16} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {filteredModels.length === 0 ? <Text style={styles.menuEmptyText}>没有匹配结果</Text> : null}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={[styles.modelBrowserHeading, { backgroundColor }]}>
            <Text style={styles.modelBrowserSectionLabel}>Providers</Text>
          </View>
          {search}
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {filteredProviders.map((entry, index) => {
              const count = selectableModels(entry).length;
              return (
                <View key={entry.provider}>
                  {index > 0 ? <View style={styles.modelBrowserSeparator} /> : null}
                  <Pressable
                    onPress={() => {
                      const providerMatches = [entry.label, entry.provider].some((value) =>
                        value?.toLocaleLowerCase().includes(normalizedQuery),
                      );
                      if (providerMatches) setSearchQuery("");
                      setProviderId(entry.provider);
                    }}
                    style={[styles.menuItem, styles.modelBrowserProviderRow, { backgroundColor }]}
                  >
                    <ProviderBrandIcon providerId={entry.provider} color={theme.colors.foregroundMuted} size={16} />
                    <Text style={[styles.menuLabel, styles.modelBrowserProviderLabel]} numberOfLines={1}>{entry.label ?? entry.provider}</Text>
                    <Text style={styles.modelBrowserCount}>{count} {count === 1 ? "model" : "models"}</Text>
                    <Icon name="ChevronRight" color={theme.colors.foregroundMuted} size={16} />
                  </Pressable>
                </View>
              );
            })}
            {filteredProviders.length === 0 ? <Text style={styles.menuEmptyText}>没有匹配结果</Text> : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}
