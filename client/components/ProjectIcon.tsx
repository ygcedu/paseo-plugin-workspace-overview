import React from "react";
import { Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export function ProjectIcon({
  dataUri,
  label,
  size = 18,
  theme,
}: {
  dataUri?: string | null;
  label: string;
  size?: number;
  theme: PluginSurfaceProps["theme"];
}) {
  if (dataUri) {
    return (
      <View
        style={
          {
            width: size,
            height: size,
            borderRadius: 4,
            backgroundImage: `url("${dataUri}")`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          } as never
        }
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.foregroundMuted + "20",
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 10, lineHeight: 14, fontWeight: "600" }}>
        {label.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}
