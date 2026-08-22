import React from "react";
import { View } from "react-native";

/**
 * Vector-style chevron icon drawn with two rotated View bars.
 * react-native-svg / lucide-react-native are not on the plugin client allow-list,
 * so this is the closest we can get to an SVG-style icon using only RN primitives.
 */
export function ChevronIcon({ expanded, color, size = 10 }: { expanded: boolean; color: string; size?: number }) {
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
