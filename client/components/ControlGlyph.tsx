import React from "react";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { OpenMenu } from "./workspace-creator-shared";

export function ControlGlyph({ kind, color }: { kind: Exclude<OpenMenu, null>; color: string }) {
  const names: Record<Exclude<OpenMenu, null>, string> = {
    project: "Folder",
    host: "Circle",
    isolation: "GitBranch",
    base: "GitBranch",
    launch: "MessageCircle",
    provider: "Boxes",
    model: "Atom",
    mode: "ListFilter",
    thinking: "Brain",
  };
  return <Icon name={names[kind]} color={color} size={16} />;
}
