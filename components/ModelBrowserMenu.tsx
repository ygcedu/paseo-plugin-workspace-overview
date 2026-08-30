import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { opaqueSurfaceColor, selectableModels, type ComposerSelection, type ProviderEntry } from "./workspace-creator-shared";
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
  const styles = useMemo(() => createMenuStyles(theme), [theme]);
  const backgroundColor = opaqueSurfaceColor(theme.colors.surface0, theme.colors.foreground);
  const provider = providerId ? providers.find((entry) => entry.provider === providerId) ?? null : null;
  const models = selectableModels(provider);

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
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {models.map((model) => {
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
          </ScrollView>
        </>
      ) : (
        <>
          <View style={[styles.modelBrowserHeading, { backgroundColor }]}>
            <Text style={styles.modelBrowserSectionLabel}>Providers</Text>
          </View>
          <ScrollView style={[styles.menuScroll, { backgroundColor }]} contentContainerStyle={{ backgroundColor }}>
            {providers.map((entry, index) => {
              const count = selectableModels(entry).length;
              return (
                <View key={entry.provider}>
                  {index > 0 ? <View style={styles.modelBrowserSeparator} /> : null}
                  <Pressable onPress={() => setProviderId(entry.provider)} style={[styles.menuItem, styles.modelBrowserProviderRow, { backgroundColor }]}>
                    <ProviderBrandIcon providerId={entry.provider} color={theme.colors.foregroundMuted} size={16} />
                    <Text style={[styles.menuLabel, styles.modelBrowserProviderLabel]} numberOfLines={1}>{entry.label ?? entry.provider}</Text>
                    <Text style={styles.modelBrowserCount}>{count} {count === 1 ? "model" : "models"}</Text>
                    <Icon name="ChevronRight" color={theme.colors.foregroundMuted} size={16} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );
}
