import React from "react";
import { Icon } from "@getpaseo/plugin/react-native";

export function ChevronIcon({ expanded, color, size = 10 }: { expanded: boolean; color: string; size?: number }) {
  return <Icon name={expanded ? "ChevronDown" : "ChevronRight"} color={color} size={size} />;
}
